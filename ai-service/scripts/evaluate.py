"""Avalia o modelo em dados sintéticos novos (seed diferente do treino).

Mede se os dias 'sick'/'thirsty' são sinalizados e o erro da previsão de consumo.
Uso: python -m scripts.evaluate
"""

import pandas as pd
from sklearn.metrics import mean_absolute_error

from app import training
from app.features import FORECAST_FEATURES, forecast_frame, hourly_features, readings_to_frame
from app.inference import detect_anomalies
from app.synthetic import generate


def main():
    bundle = training.load()
    if bundle is None:
        raise SystemExit("Nenhum modelo salvo. Rode python -m scripts.train --synthetic")

    raw = generate(days=20, seed=7)
    scenario = raw.assign(day=raw["timestamp"].dt.date).groupby(["pet_id", "day"])["scenario"].first()
    df = readings_to_frame(raw)

    for pet_id, pet_df in df.groupby("pet_id"):
        hourly = detect_anomalies(bundle, hourly_features(pet_df), pet_id)
        per_day = hourly.groupby(hourly.index.date)["is_anomaly"].sum().rename("horas_anomalas")
        per_day = per_day.to_frame().join(scenario.loc[pet_id].rename("cenario"))
        print(f"\n== {pet_id}: horas anômalas por tipo de dia (média) ==")
        print(per_day.groupby("cenario")["horas_anomalas"].mean().round(2).to_string())

        for target, model in bundle["forecasters"].items():
            frame = forecast_frame(hourly, target).dropna(subset=["y"])
            mae = mean_absolute_error(frame["y"], model.predict(frame[FORECAST_FEATURES]))
            print(f"MAE previsão {target} (próxima hora): {mae:.1f}")


if __name__ == "__main__":
    main()
