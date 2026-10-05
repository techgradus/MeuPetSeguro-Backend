from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class SensorReading(BaseModel):
    """Uma leitura dos sensores do comedouro/coleira (contrato de dados com o IoT)."""

    pet_id: str
    timestamp: datetime
    food_g: float = Field(ge=0, description="Peso de ração no pote (balança/célula de carga), em gramas")
    water_ml: float = Field(ge=0, description="Volume de água no pote, em ml")
    activity: float = Field(ge=0, le=1, description="Nível de atividade normalizado 0-1 (acelerômetro/PIR)")


class ReadingsRequest(BaseModel):
    readings: list[SensorReading] = Field(min_length=1)

    @model_validator(mode="after")
    def single_pet(self):
        if len({r.pet_id for r in self.readings}) > 1:
            raise ValueError("Envie leituras de um único pet por requisição")
        return self


class TrainRequest(BaseModel):
    readings: list[SensorReading] = Field(min_length=1)


class Insight(BaseModel):
    type: str
    severity: Literal["info", "warning", "critical"]
    message: str
    data: dict = Field(default_factory=dict)


class InsightsResponse(BaseModel):
    pet_id: str
    generated_at: datetime
    model_version: str
    model_source: str
    insights: list[Insight]


class HourlyAnomaly(BaseModel):
    hour: datetime
    score: float
    is_anomaly: bool
    food_eaten_g: float
    water_drunk_ml: float
    activity: float


class AnomalyResponse(BaseModel):
    pet_id: str
    hours: list[HourlyAnomaly]


class BowlForecast(BaseModel):
    current: float
    hours_until_low: float | None
    hours_until_empty: float | None


class BowlsResponse(BaseModel):
    pet_id: str
    food: BowlForecast
    water: BowlForecast
