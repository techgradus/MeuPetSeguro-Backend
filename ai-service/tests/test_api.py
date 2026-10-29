import pandas as pd

from app import config
from tests.conftest import to_payload


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is True
    assert body["model_source"] == "synthetic"


def test_insights_normal_day(client, normal_day):
    res = client.post("/insights", json=to_payload(normal_day))
    assert res.status_code == 200
    body = res.json()
    assert body["pet_id"] == "pet-1"
    assert body["insights"]
    assert all(i["severity"] in {"info", "warning", "critical"} for i in body["insights"])


def test_empty_water_bowl_is_critical(client, normal_day):
    df = normal_day.copy()
    df.loc[df.index[-6:], "water_ml"] = 0
    types = {i["type"]: i["severity"] for i in client.post("/insights", json=to_payload(df)).json()["insights"]}
    assert types.get("water_empty") == "critical"


def test_excess_water_flagged(client, normal_day):
    df = normal_day.copy()
    # Simula sede excessiva: pote esvaziando 3x mais rápido
    drunk = (config.WATER_BOWL_CAPACITY_ML - df["water_ml"]).clip(lower=0)
    df["water_ml"] = (config.WATER_BOWL_CAPACITY_ML - drunk * 3).clip(lower=50)
    types = [i["type"] for i in client.post("/insights", json=to_payload(df)).json()["insights"]]
    assert "water_drunk_ml_vs_baseline" in types


def test_bowls_forecast(client, normal_day):
    body = client.post("/predict/bowls", json=to_payload(normal_day)).json()
    assert body["food"]["current"] >= 0
    if body["food"]["hours_until_empty"] is not None and body["food"]["hours_until_low"] is not None:
        assert body["food"]["hours_until_low"] <= body["food"]["hours_until_empty"]


def test_anomaly_endpoint_returns_hours(client, normal_day):
    body = client.post("/predict/anomaly", json=to_payload(normal_day)).json()
    assert len(body["hours"]) >= 24


def test_rejects_multiple_pets(client, normal_day):
    payload = to_payload(normal_day)
    payload["readings"][0]["pet_id"] = "outro-pet"
    assert client.post("/insights", json=payload).status_code == 422


def test_rejects_invalid_activity(client, normal_day):
    payload = to_payload(normal_day)
    payload["readings"][0]["activity"] = 5
    assert client.post("/insights", json=payload).status_code == 422


def test_train_requires_enough_data(client, normal_day):
    payload = to_payload(normal_day.head(10))
    assert client.post("/train", json=payload).status_code == 422


def test_train_with_real_data(client):
    from app.synthetic import generate
    df = generate(days=3, seed=5, anomaly_days=0)
    res = client.post("/train", json=to_payload(df))
    assert res.status_code == 200
    assert client.get("/health").json()["model_source"] == "real"
