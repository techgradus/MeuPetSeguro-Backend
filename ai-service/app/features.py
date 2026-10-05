"""Transforma leituras brutas dos sensores em features horárias para os modelos."""

import numpy as np
import pandas as pd

from . import config

# Consumo é expresso como fração da rotina do próprio pet, para cão e gato serem comparáveis
ANOMALY_FEATURES = [
    "hour_sin", "hour_cos", "activity", "activity_6h",
    "food_ratio_1h", "water_ratio_1h", "food_ratio_24h", "water_ratio_24h", "activity_ratio_24h",
]
FORECAST_FEATURES = ["hour_sin", "hour_cos", "target_mean_24h", "activity_mean_24h"]
READING_COLUMNS = ["pet_id", "timestamp", "food_g", "water_ml", "activity"]


def readings_to_frame(readings) -> pd.DataFrame:
    """Aceita lista de SensorReading/dicts ou DataFrame e devolve DataFrame normalizado."""
    if isinstance(readings, pd.DataFrame):
        df = readings.copy()
    else:
        df = pd.DataFrame([r.model_dump() if hasattr(r, "model_dump") else r for r in readings])

    missing = set(READING_COLUMNS) - set(df.columns)
    if missing:
        raise ValueError(f"Colunas ausentes nas leituras: {sorted(missing)}")

    ts = pd.to_datetime(df["timestamp"], utc=False)
    # Hora do dia precisa estar no fuso local do pet para capturar a rotina (refeições, sono)
    if ts.dt.tz is not None:
        ts = ts.dt.tz_convert(config.TIMEZONE).dt.tz_localize(None)
    df["timestamp"] = ts
    return df[READING_COLUMNS].sort_values(["pet_id", "timestamp"]).reset_index(drop=True)


def _consumption(series: pd.Series, noise: float) -> pd.Series:
    """Quedas no nível = consumo. Subidas (reabastecimento) e ruído viram zero."""
    drop = -series.diff()
    return drop.where(drop >= noise, 0.0).fillna(0.0)


def hourly_features(df: pd.DataFrame) -> pd.DataFrame:
    """Agrega leituras de UM pet em janelas de 1h."""
    df = df.sort_values("timestamp").set_index("timestamp")
    tmp = pd.DataFrame(
        {
            "food_eaten_g": _consumption(df["food_g"], config.FOOD_NOISE_G),
            "water_drunk_ml": _consumption(df["water_ml"], config.WATER_NOISE_ML),
            "activity": df["activity"],
        }
    )
    hourly = tmp.resample("1h").agg({"food_eaten_g": "sum", "water_drunk_ml": "sum", "activity": "mean"})
    # Horas sem nenhuma leitura (sensor offline) são descartadas
    hourly = hourly.dropna(subset=["activity"])

    hour = hourly.index.hour
    hourly["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    hourly["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    return hourly


def forecast_frame(hourly: pd.DataFrame, target: str) -> pd.DataFrame:
    """Features para prever o consumo da PRÓXIMA hora a partir do histórico até agora."""
    out = pd.DataFrame(index=hourly.index)
    out["target_mean_24h"] = hourly[target].rolling(24, min_periods=1).mean()
    out["activity_mean_24h"] = hourly["activity"].rolling(24, min_periods=1).mean()
    nxt = hourly.index + pd.Timedelta(hours=1)
    out["hour_sin"] = np.sin(2 * np.pi * nxt.hour / 24)
    out["hour_cos"] = np.cos(2 * np.pi * nxt.hour / 24)
    # Alvo = consumo da hora seguinte; NaN se essa hora não tiver leituras
    out["y"] = hourly[target].reindex(nxt).to_numpy()
    return out


def add_context(hourly: pd.DataFrame, baseline: dict) -> pd.DataFrame:
    """Adiciona features relativas à rotina normal do pet (baseline) e janelas móveis."""
    out = hourly.copy()
    food_day = max(baseline["food_g_per_day"], 1e-6)
    water_day = max(baseline["water_ml_per_day"], 1e-6)
    act_mean = max(baseline["activity_mean"], 1e-6)

    out["food_ratio_1h"] = out["food_eaten_g"] / food_day
    out["water_ratio_1h"] = out["water_drunk_ml"] / water_day
    out["activity_6h"] = out["activity"].rolling("6h").mean()

    # Janelas de 24h com pouca cobertura viram neutras (1.0) para não gerar falso alarme
    count = out["activity"].rolling("24h").count()
    full = count >= 20
    out["food_ratio_24h"] = (out["food_eaten_g"].rolling("24h").sum() / food_day).where(full, 1.0)
    out["water_ratio_24h"] = (out["water_drunk_ml"].rolling("24h").sum() / water_day).where(full, 1.0)
    out["activity_ratio_24h"] = (out["activity"].rolling("24h").mean() / act_mean).where(full, 1.0)
    return out
