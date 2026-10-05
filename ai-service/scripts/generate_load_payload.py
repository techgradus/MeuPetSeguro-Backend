"""Gera o corpo da requisição usado no teste de carga do JMeter (24h de leituras de um pet).

Uso: python -m scripts.generate_load_payload
"""

import json

import pandas as pd

from app.synthetic import generate

OUT = "tests/performance/payload.json"


def main():
    df = generate(days=2, seed=11, anomaly_days=0,
                  profiles=[{"pet_id": "pet-carga", "food_per_day": 250, "water_per_day": 600}])
    df = df[df["timestamp"] > df["timestamp"].max() - pd.Timedelta(hours=24)].drop(columns="scenario")
    df["timestamp"] = df["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%S-03:00")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"readings": df.to_dict(orient="records")}, f)
    print(f"{len(df)} leituras salvas em {OUT}")


if __name__ == "__main__":
    main()
