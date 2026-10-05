import pytest
from fastapi.testclient import TestClient

from app import main, training
from app.synthetic import generate


@pytest.fixture(scope="session")
def bundle():
    return training.train(generate(days=10, seed=1), source="synthetic")


@pytest.fixture()
def client(bundle, monkeypatch):
    monkeypatch.setattr(training, "load", lambda *a, **k: bundle)
    monkeypatch.setattr(training, "save", lambda *a, **k: None)
    with TestClient(main.app) as c:
        yield c


def to_payload(df):
    df = df.drop(columns=["scenario"], errors="ignore").copy()
    df["timestamp"] = df["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%S")
    return {"readings": df.to_dict(orient="records")}


@pytest.fixture()
def normal_day():
    df = generate(days=3, seed=99, anomaly_days=0, profiles=[{"pet_id": "pet-1", "food_per_day": 250, "water_per_day": 600}])
    return df[df["timestamp"] >= df["timestamp"].max() - __import__("pandas").Timedelta(hours=30)]
