import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException

from . import config, training
from .inference import analyze, build_insights, now_utc
from .schemas import (
    AnomalyResponse,
    BowlsResponse,
    HourlyAnomaly,
    InsightsResponse,
    ReadingsRequest,
    TrainRequest,
)
from .synthetic import generate

log = logging.getLogger("ai-service")

state: dict = {"bundle": None}


@asynccontextmanager
async def lifespan(_: FastAPI):
    bundle = training.load()
    if bundle is None and config.AUTO_TRAIN_SYNTHETIC:
        log.warning("Nenhum modelo salvo. Treinando com dados SINTÉTICOS.")
        bundle = training.train(generate(), source="synthetic")
        training.save(bundle)
    state["bundle"] = bundle
    yield


app = FastAPI(
    title="MeuPet Seguro - Serviço de IA",
    description="Detecção de anomalias de comportamento e previsão de consumo de ração/água.",
    version="0.1.0",
    lifespan=lifespan,
)


def get_bundle() -> dict:
    if state["bundle"] is None:
        raise HTTPException(503, "Modelo ainda não treinado. Rode scripts/train.py ou POST /train.")
    return state["bundle"]


def run_analysis(req: ReadingsRequest):
    bundle = get_bundle()
    try:
        return bundle, analyze(bundle, req.readings)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/health")
def health():
    bundle = state["bundle"]
    return {
        "status": "ok",
        "model_loaded": bundle is not None,
        "model_version": bundle["version"] if bundle else None,
        "model_source": bundle["source"] if bundle else None,
    }


@app.get("/model/info")
def model_info():
    b = get_bundle()
    return {k: b[k] for k in ("version", "trained_at", "source", "n_hours", "n_pets", "global_baseline")}


@app.post("/insights", response_model=InsightsResponse)
def insights(req: ReadingsRequest):
    bundle, result = run_analysis(req)
    return InsightsResponse(
        pet_id=result["pet_id"],
        generated_at=now_utc(),
        model_version=bundle["version"],
        model_source=bundle["source"],
        insights=build_insights(bundle, result),
    )


@app.post("/predict/anomaly", response_model=AnomalyResponse)
def predict_anomaly(req: ReadingsRequest):
    _, result = run_analysis(req)
    hours = [
        HourlyAnomaly(hour=ts, score=round(float(r["score"]), 4), is_anomaly=bool(r["is_anomaly"]),
                      food_eaten_g=round(float(r["food_eaten_g"]), 1),
                      water_drunk_ml=round(float(r["water_drunk_ml"]), 1),
                      activity=round(float(r["activity"]), 3))
        for ts, r in result["hourly"].iterrows()
    ]
    return AnomalyResponse(pet_id=result["pet_id"], hours=hours)


@app.post("/predict/bowls", response_model=BowlsResponse)
def predict_bowls(req: ReadingsRequest):
    _, result = run_analysis(req)
    return BowlsResponse(pet_id=result["pet_id"], food=result["food"], water=result["water"])


@app.post("/train")
def train(req: TrainRequest, x_admin_token: str = Header(default="")):
    """Re-treina com dados reais enviados pelo backend."""
    if config.ADMIN_TOKEN and x_admin_token != config.ADMIN_TOKEN:
        raise HTTPException(401, "Token inválido")
    try:
        bundle = training.train(req.readings, source="real")
    except ValueError as e:
        raise HTTPException(422, str(e))
    training.save(bundle)
    state["bundle"] = bundle
    return {"version": bundle["version"], "n_hours": bundle["n_hours"], "n_pets": bundle["n_pets"]}
