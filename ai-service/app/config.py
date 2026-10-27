import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

MODELS_DIR = Path(os.getenv("AI_MODELS_DIR", BASE_DIR / "models"))
if not MODELS_DIR.is_absolute():
    MODELS_DIR = BASE_DIR / MODELS_DIR
MODEL_PATH = MODELS_DIR / "pet_model.joblib"

TIMEZONE = os.getenv("AI_TIMEZONE", "America/Sao_Paulo")

FOOD_BOWL_CAPACITY_G = float(os.getenv("FOOD_BOWL_CAPACITY_G", "300"))
WATER_BOWL_CAPACITY_ML = float(os.getenv("WATER_BOWL_CAPACITY_ML", "1000"))
# Abaixo dessa fração da capacidade o pote é considerado "quase vazio"
LOW_LEVEL_RATIO = 0.15

# Variações menores que isso entre duas leituras são tratadas como ruído da balança/sensor
FOOD_NOISE_G = 2.0
WATER_NOISE_ML = 6.0

AUTO_TRAIN_SYNTHETIC = os.getenv("AUTO_TRAIN_SYNTHETIC", "true").lower() == "true"
ADMIN_TOKEN = os.getenv("AI_ADMIN_TOKEN", "")
