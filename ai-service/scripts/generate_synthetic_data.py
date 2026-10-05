"""Gera um CSV de leituras sintéticas no mesmo formato que o IoT vai enviar.

Uso: python -m scripts.generate_synthetic_data --days 30 --out data/synthetic.csv
"""

import argparse

from app.synthetic import generate


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", default="data/synthetic.csv")
    args = parser.parse_args()

    df = generate(days=args.days, seed=args.seed)
    df.to_csv(args.out, index=False)
    print(f"{len(df)} leituras salvas em {args.out}")
    print(df.groupby(["pet_id", "scenario"]).size().div(288).rename("dias").to_string())


if __name__ == "__main__":
    main()
