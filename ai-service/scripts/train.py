"""Treina e salva o modelo.

Dados sintéticos:   python -m scripts.train --synthetic
Dados reais (CSV):  python -m scripts.train --csv data/leituras.csv

O CSV precisa das colunas: pet_id, timestamp, food_g, water_ml, activity
"""

import argparse

import pandas as pd

from app import config, training
from app.synthetic import generate


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--csv", help="Arquivo CSV com leituras reais")
    group.add_argument("--synthetic", action="store_true", help="Treinar com dados sintéticos")
    parser.add_argument("--days", type=int, default=30, help="Dias sintéticos (com --synthetic)")
    args = parser.parse_args()

    if args.synthetic:
        data, source = generate(days=args.days), "synthetic"
    else:
        data, source = pd.read_csv(args.csv), "real"

    bundle = training.train(data, source=source)
    training.save(bundle)
    print(f"Modelo {bundle['version']} ({source}) treinado com {bundle['n_hours']}h de {bundle['n_pets']} pet(s)")
    print(f"Salvo em {config.MODEL_PATH}")
    print("Baseline global:", bundle["global_baseline"])


if __name__ == "__main__":
    main()
