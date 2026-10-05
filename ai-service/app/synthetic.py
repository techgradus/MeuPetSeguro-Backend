"""Gerador de dados sintéticos que imitam os sensores do comedouro + coleira.

Serve para desenvolver e treinar os modelos enquanto os dados reais do ESP32 não chegam.
Inclui dias "doentes" (pouca atividade/comida) e de "sede excessiva" para o modelo de anomalia.
"""

from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from . import config

STEP_MIN = 5

PET_PROFILES = [
    {"pet_id": "pet-demo-cao", "food_per_day": 250, "water_per_day": 600},
    {"pet_id": "pet-demo-gato", "food_per_day": 70, "water_per_day": 200},
]


def generate(days: int = 30, seed: int = 42, start: datetime | None = None, profiles=PET_PROFILES,
             anomaly_days: int = 2) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    start = start or datetime(2026, 1, 1)
    rows = []

    for profile in profiles:
        food, water = config.FOOD_BOWL_CAPACITY_G, config.WATER_BOWL_CAPACITY_ML
        special = rng.choice(np.arange(3, days), size=min(anomaly_days * 2, max(days - 3, 0)), replace=False)
        sick_days = set(special[:anomaly_days].tolist())
        thirsty_days = set(special[anomaly_days:].tolist())

        for day in range(days):
            scenario = "sick" if day in sick_days else "thirsty" if day in thirsty_days else "normal"
            food_factor = 0.3 if scenario == "sick" else 1.0
            water_factor = 2.2 if scenario == "thirsty" else 0.6 if scenario == "sick" else 1.0
            activity_factor = 0.4 if scenario == "sick" else 1.0

            meals = sorted(m + rng.normal(0, 0.4) for m in (7, 12.5, 19))
            meal_size = profile["food_per_day"] * food_factor / len(meals) * rng.uniform(0.85, 1.15)
            sip = profile["water_per_day"] / 18

            for step in range(24 * 60 // STEP_MIN):
                ts = start + timedelta(days=day, minutes=step * STEP_MIN)
                h = ts.hour + ts.minute / 60
                awake = 6 <= h < 23

                # Reabastecimento pelo tutor
                if ts.hour in (7, 18) and ts.minute == 0 and food < config.FOOD_BOWL_CAPACITY_G * 0.5:
                    food = config.FOOD_BOWL_CAPACITY_G
                if ts.hour == 8 and ts.minute == 0 and water < config.WATER_BOWL_CAPACITY_ML * 0.6:
                    water = config.WATER_BOWL_CAPACITY_ML

                # Refeições: come em ~15 min (3 passos)
                eating = any(m <= h < m + 0.25 for m in meals)
                if eating:
                    food = max(food - meal_size / 3, 0)

                # Goles de água espalhados pelo dia
                if rng.random() < (0.12 if awake else 0.015):
                    water = max(water - sip * water_factor * rng.uniform(0.6, 1.4), 0)

                base = 0.15 + 0.45 * max(np.sin(np.pi * (h - 6) / 17), 0) if awake else 0.05
                activity = base * activity_factor + (0.25 if eating else 0) + rng.normal(0, 0.05)

                rows.append({
                    "pet_id": profile["pet_id"],
                    "timestamp": ts,
                    "food_g": round(max(food + rng.normal(0, 0.5), 0), 1),
                    "water_ml": round(max(water + rng.normal(0, 2), 0), 1),
                    "activity": round(float(np.clip(activity, 0, 1)), 3),
                    "scenario": scenario,
                })

    return pd.DataFrame(rows)
