"""Treino dos modelos. Funciona igual para dados sintéticos e reais."""

from datetime import UTC, datetime

import joblib
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, IsolationForest
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from . import config
from .features import (
    ANOMALY_FEATURES,
    FORECAST_FEATURES,
    add_context,
    forecast_frame,
    hourly_features,
    readings_to_frame,
)

MIN_HOURS_TO_TRAIN = 48


def _daily_baseline(hourly: pd.DataFrame) -> dict:
    """Médias diárias 'normais' do pet, usadas para comparar as últimas 24h."""
    daily = hourly.groupby(hourly.index.date).agg(
        food_eaten_g=("food_eaten_g", "sum"),
        water_drunk_ml=("water_drunk_ml", "sum"),
        activity=("activity", "mean"),
        hours=("activity", "size"),
    )
    daily = daily[daily["hours"] >= 20]  # só dias com cobertura quase completa
    if daily.empty:
        daily = daily.reindex([0]).fillna(0)
    return {
        "food_g_per_day": float(daily["food_eaten_g"].median()),
        "water_ml_per_day": float(daily["water_drunk_ml"].median()),
        "activity_mean": float(daily["activity"].median()),
    }


def train(readings, source: str = "real") -> dict:
    df = readings_to_frame(readings)

    hourly_parts, forecast_parts = [], {"food_eaten_g": [], "water_drunk_ml": []}
    baselines = {}
    for pet_id, pet_df in df.groupby("pet_id"):
        hourly = hourly_features(pet_df)
        baselines[pet_id] = _daily_baseline(hourly)
        hourly_parts.append(add_context(hourly, baselines[pet_id]))
        for target in forecast_parts:
            forecast_parts[target].append(forecast_frame(hourly, target))

    hourly_all = pd.concat(hourly_parts)
    if len(hourly_all) < MIN_HOURS_TO_TRAIN:
        raise ValueError(f"Dados insuficientes: {len(hourly_all)}h de leituras (mínimo {MIN_HOURS_TO_TRAIN}h)")

    anomaly = make_pipeline(
        StandardScaler(),
        IsolationForest(n_estimators=200, contamination=0.03, random_state=42),
    )
    anomaly.fit(hourly_all[ANOMALY_FEATURES])

    forecasters = {}
    for target, parts in forecast_parts.items():
        frame = pd.concat(parts).dropna(subset=["y"])
        model = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.05, random_state=42)
        model.fit(frame[FORECAST_FEATURES], frame["y"])
        forecasters[target] = model

    # Baseline global serve de fallback para pets novos, sem histórico próprio
    global_baseline = {k: float(pd.Series([b[k] for b in baselines.values()]).median()) for k in next(iter(baselines.values()))}

    now = datetime.now(UTC)
    return {
        "version": now.strftime("%Y%m%d%H%M%S"),
        "trained_at": now.isoformat(),
        "source": source,
        "n_hours": int(len(hourly_all)),
        "n_pets": len(baselines),
        "anomaly": anomaly,
        "forecasters": forecasters,
        "baselines": baselines,
        "global_baseline": global_baseline,
    }


def save(bundle: dict, path=config.MODEL_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, path)


def load(path=config.MODEL_PATH) -> dict | None:
    return joblib.load(path) if path.exists() else None
