"""Uso dos modelos treinados: anomalias, previsão de esvaziamento dos potes e insights."""

from datetime import UTC, datetime

import numpy as np
import pandas as pd

from . import config
from .features import ANOMALY_FEATURES, FORECAST_FEATURES, add_context, hourly_features, readings_to_frame
from .schemas import BowlForecast, Insight

FORECAST_HORIZON_H = 72
RECENT_ANOMALY_WINDOW_H = 6
NO_WATER_ALERT_H = 10


def detect_anomalies(bundle: dict, hourly: pd.DataFrame, pet_id: str) -> pd.DataFrame:
    model = bundle["anomaly"]
    out = add_context(hourly, baseline_for(bundle, pet_id))
    # decision_function < 0 = anômalo; invertemos para "quanto maior, mais estranho"
    out["score"] = -model.decision_function(out[ANOMALY_FEATURES])
    # Mesmo critério do model.predict(), sem rodar o modelo duas vezes
    out["is_anomaly"] = out["score"] > 0
    return out


def forecast_bowl(bundle: dict, hourly: pd.DataFrame, target: str, current: float, capacity: float) -> BowlForecast:
    """Simula hora a hora o consumo previsto até o pote ficar baixo/vazio."""
    model = bundle["forecasters"][target]
    low = capacity * config.LOW_LEVEL_RATIO
    target_mean = float(hourly[target].tail(24).mean())
    activity_mean = float(hourly["activity"].tail(24).mean())

    start = hourly.index[-1]
    future = [start + pd.Timedelta(hours=h) for h in range(1, FORECAST_HORIZON_H + 1)]
    hours = np.array([t.hour for t in future])
    X = pd.DataFrame(
        {
            "hour_sin": np.sin(2 * np.pi * hours / 24),
            "hour_cos": np.cos(2 * np.pi * hours / 24),
            "target_mean_24h": target_mean,
            "activity_mean_24h": activity_mean,
        }
    )[FORECAST_FEATURES]
    consumption = np.clip(model.predict(X), 0, None)
    level = current - np.cumsum(consumption)

    def first_hour_below(threshold):
        if current <= threshold:
            return 0.0
        idx = np.flatnonzero(level <= threshold)
        return float(idx[0] + 1) if idx.size else None

    return BowlForecast(
        current=round(current, 1),
        hours_until_low=first_hour_below(low),
        hours_until_empty=first_hour_below(0),
    )


def baseline_for(bundle: dict, pet_id: str) -> dict:
    return bundle["baselines"].get(pet_id, bundle["global_baseline"])


def analyze(bundle: dict, readings):
    """Roda todo o pipeline para as leituras de um pet."""
    df = readings_to_frame(readings)
    hourly = hourly_features(df)
    last = df.iloc[-1]
    pet_id = str(last["pet_id"])
    return {
        "pet_id": pet_id,
        "df": df,
        "hourly": detect_anomalies(bundle, hourly, pet_id),
        "food": forecast_bowl(bundle, hourly, "food_eaten_g", float(last["food_g"]), config.FOOD_BOWL_CAPACITY_G),
        "water": forecast_bowl(bundle, hourly, "water_drunk_ml", float(last["water_ml"]), config.WATER_BOWL_CAPACITY_ML),
    }


def _fmt_hours(h: float) -> str:
    if h < 1:
        return "menos de 1 hora"
    return f"cerca de {int(round(h))} hora{'s' if round(h) != 1 else ''}"


def build_insights(bundle: dict, result: dict) -> list[Insight]:
    insights: list[Insight] = []
    hourly, df = result["hourly"], result["df"]

    # 1. Nível e previsão de esvaziamento dos potes
    for key, label, unit in (("food", "ração", "g"), ("water", "água", "ml")):
        fc: BowlForecast = result[key]
        if fc.current <= 0:
            insights.append(Insight(type=f"{key}_empty", severity="critical",
                                    message=f"O pote de {label} está vazio.", data=fc.model_dump()))
        elif fc.hours_until_low == 0:
            insights.append(Insight(type=f"{key}_low", severity="warning",
                                    message=f"O pote de {label} está quase vazio ({fc.current:.0f}{unit}).",
                                    data=fc.model_dump()))
        elif fc.hours_until_low is not None and fc.hours_until_low <= 12:
            insights.append(Insight(type=f"{key}_forecast", severity="info",
                                    message=f"Previsão: o pote de {label} deve ficar baixo em {_fmt_hours(fc.hours_until_low)}.",
                                    data=fc.model_dump()))

    # 2. Comportamento anômalo recente (Isolation Forest)
    recent = hourly.tail(RECENT_ANOMALY_WINDOW_H)
    anomalous = recent[recent["is_anomaly"]]
    if not anomalous.empty:
        worst = anomalous.sort_values("score", ascending=False).iloc[0]
        insights.append(Insight(
            type="behavior_anomaly", severity="warning",
            message=(f"Comportamento fora do padrão detectado às {worst.name:%H}h "
                     f"(atividade {worst['activity']:.0%}, comeu {worst['food_eaten_g']:.0f}g, "
                     f"bebeu {worst['water_drunk_ml']:.0f}ml)."),
            data={"hours": [h.isoformat() for h in anomalous.index], "max_score": round(float(worst["score"]), 3)},
        ))

    # 3. Últimas 24h comparadas à rotina normal do pet
    span_h = (df["timestamp"].iloc[-1] - df["timestamp"].iloc[0]).total_seconds() / 3600
    if span_h >= 20:
        last24 = hourly[hourly.index > hourly.index[-1] - pd.Timedelta(hours=24)]
        base = baseline_for(bundle, result["pet_id"])
        checks = (
            ("water_drunk_ml", "water_ml_per_day", "água", 1.5, "high",
             "Consumo de água {pct:.0%} acima do normal nas últimas 24h. Sede excessiva pode indicar problema de saúde; considere consultar um veterinário."),
            ("food_eaten_g", "food_g_per_day", "ração", 0.5, "low",
             "Pet comeu apenas {ratio:.0%} da quantidade habitual nas últimas 24h."),
            ("activity", "activity_mean", "atividade", 0.5, "low",
             "Atividade nas últimas 24h está em {ratio:.0%} do normal. O pet pode estar apático."),
        )
        for col, base_key, _, limit, direction, template in checks:
            expected = base[base_key]
            if expected <= 0:
                continue
            observed = last24[col].mean() if col == "activity" else last24[col].sum()
            ratio = observed / expected
            if (direction == "high" and ratio >= limit) or (direction == "low" and ratio <= limit):
                insights.append(Insight(
                    type=f"{col}_vs_baseline", severity="warning",
                    message=template.format(ratio=ratio, pct=ratio - 1),
                    data={"observed": round(float(observed), 2), "expected": round(expected, 2), "ratio": round(float(ratio), 2)},
                ))

    # 4. Muito tempo sem beber água
    drinking = hourly[hourly["water_drunk_ml"] > 0]
    if not drinking.empty and span_h >= NO_WATER_ALERT_H:
        since = (hourly.index[-1] - drinking.index[-1]).total_seconds() / 3600
        if since >= NO_WATER_ALERT_H:
            insights.append(Insight(type="no_water", severity="warning",
                                    message=f"O pet não bebe água há {_fmt_hours(since)}.",
                                    data={"hours_since_last_drink": since}))

    if not insights:
        insights.append(Insight(type="all_good", severity="info", message="Tudo dentro do padrão para o seu pet."))
    return insights


def now_utc() -> datetime:
    return datetime.now(UTC)
