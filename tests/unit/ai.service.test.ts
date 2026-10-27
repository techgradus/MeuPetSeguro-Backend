import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../src/app";
import { prismaMock } from "../prismaMock";
import { analyzePet, buildPetReadings, insightToAlert, type AiInsight } from "../../src/services/ai.service";
import { authHeader, pet, PET_ID } from "../helpers";

const ALL_DEVICES = [{ type: "COLLAR" }, { type: "FOOD_BOWL" }, { type: "WATER_BOWL" }];
const slot = (min: number) => new Date(Date.UTC(2026, 9, 27, 12, min));

const insight = (type: string, data: Record<string, unknown> = {}, message = "Msg da IA"): AiInsight => ({
  type,
  severity: "warning",
  message,
  data,
});

const mockAiResponse = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })
  );

beforeEach(() => {
  process.env.AI_API_URL = "http://ia.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_API_URL;
});

describe("buildPetReadings", () => {
  it("junta coleira e potes por janela de 5 min e repete o último valor conhecido", async () => {
    prismaMock.device.findMany.mockResolvedValue(ALL_DEVICES);
    prismaMock.$queryRaw.mockResolvedValue([
      { slot: slot(0), type: "FOOD_BOWL", weight: 800, intensity: null },
      { slot: slot(0), type: "WATER_BOWL", weight: 950, intensity: null },
      { slot: slot(0), type: "COLLAR", weight: null, intensity: 0.4 },
      // janela seguinte só com a coleira: os potes repetem o valor anterior
      { slot: slot(5), type: "COLLAR", weight: null, intensity: 0.7 },
    ]);

    const readings = await buildPetReadings(PET_ID);

    expect(readings).toEqual([
      { pet_id: PET_ID, timestamp: slot(0).toISOString(), food_g: 800, water_ml: 950, activity: 0.4 },
      { pet_id: PET_ID, timestamp: slot(5).toISOString(), food_g: 800, water_ml: 950, activity: 0.7 },
    ]);
  });

  it("ignora janelas antes de todos os dispositivos terem enviado algo", async () => {
    prismaMock.device.findMany.mockResolvedValue(ALL_DEVICES);
    prismaMock.$queryRaw.mockResolvedValue([
      { slot: slot(0), type: "COLLAR", weight: null, intensity: 0.4 },
      { slot: slot(5), type: "FOOD_BOWL", weight: 800, intensity: null },
    ]);

    await expect(buildPetReadings(PET_ID)).resolves.toEqual([]);
  });

  it("retorna null se o pet não tem coleira e os dois potes", async () => {
    prismaMock.device.findMany.mockResolvedValue([{ type: "COLLAR" }, { type: "FOOD_BOWL" }]);

    await expect(buildPetReadings(PET_ID)).resolves.toBeNull();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("insightToAlert", () => {
  it("previsão de ração/água vira LOW_FOOD/LOW_WATER com o tempo estimado", () => {
    expect(insightToAlert(insight("food_forecast", { hours_until_low: 5.2 }), "Rex")).toEqual({
      type: "LOW_FOOD",
      message: "Previsão: a ração de Rex deve acabar em cerca de 5 horas",
    });
    expect(insightToAlert(insight("water_forecast", { hours_until_low: 0.5 }), "Rex")).toEqual({
      type: "LOW_WATER",
      message: "Previsão: a água de Rex deve acabar em menos de 1 hora",
    });
  });

  it.each(["behavior_anomaly", "water_drunk_ml_vs_baseline", "food_eaten_g_vs_baseline", "activity_vs_baseline", "no_water"])(
    "%s vira ACTIVITY_ANOMALY com o nome do pet",
    (type) => {
      expect(insightToAlert(insight(type, {}, "Comportamento fora do padrão"), "Rex")).toEqual({
        type: "ACTIVITY_ANOMALY",
        message: "Rex: comportamento fora do padrão",
      });
    }
  );

  it.each(["all_good", "food_low", "water_empty", "food_empty"])("%s não vira alerta", (type) => {
    // pote baixo/vazio agora já é alertado pelo reading.service na chegada da leitura
    expect(insightToAlert(insight(type), "Rex")).toBeNull();
  });
});

describe("analyzePet", () => {
  beforeEach(() => {
    prismaMock.device.findMany.mockResolvedValue(ALL_DEVICES);
    prismaMock.$queryRaw.mockResolvedValue([
      { slot: slot(0), type: "FOOD_BOWL", weight: 800, intensity: null },
      { slot: slot(0), type: "WATER_BOWL", weight: 950, intensity: null },
      { slot: slot(0), type: "COLLAR", weight: null, intensity: 0.4 },
    ]);
  });

  it("cria alertas a partir dos insights da IA", async () => {
    mockAiResponse({
      pet_id: PET_ID,
      model_version: "v1",
      model_source: "real",
      insights: [insight("behavior_anomaly", {}, "Comportamento fora do padrão"), insight("all_good")],
    });
    prismaMock.alert.findFirst.mockResolvedValue(null);

    await analyzePet({ id: PET_ID, name: "Rex" });

    expect(prismaMock.alert.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.alert.create).toHaveBeenCalledWith({
      data: { petId: PET_ID, type: "ACTIVITY_ANOMALY", message: "Rex: comportamento fora do padrão" },
    });
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://ia.test/insights");
    expect(JSON.parse(init.body).readings).toHaveLength(1);
  });

  it("não repete o alerta se já existe um igual recente", async () => {
    mockAiResponse({ pet_id: PET_ID, model_version: "v1", model_source: "real", insights: [insight("behavior_anomaly")] });
    prismaMock.alert.findFirst.mockResolvedValue({ id: "a1" });

    await analyzePet({ id: PET_ID, name: "Rex" });

    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });

  it("pet sem dispositivos é pulado sem chamar a IA", async () => {
    prismaMock.device.findMany.mockResolvedValue([]);
    mockAiResponse({});

    await expect(analyzePet({ id: PET_ID, name: "Rex" })).resolves.toMatchObject({ skipped: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/pets/:petId/insights", () => {
  beforeEach(() => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
  });

  it("devolve os insights da IA para o app", async () => {
    prismaMock.device.findMany.mockResolvedValue(ALL_DEVICES);
    prismaMock.$queryRaw.mockResolvedValue([
      { slot: slot(0), type: "FOOD_BOWL", weight: 800, intensity: null },
      { slot: slot(0), type: "WATER_BOWL", weight: 950, intensity: null },
      { slot: slot(0), type: "COLLAR", weight: null, intensity: 0.4 },
    ]);
    mockAiResponse({ pet_id: PET_ID, model_version: "v1", model_source: "real", insights: [insight("all_good")] });

    const res = await request(app).get(`/api/pets/${PET_ID}/insights`).set("Authorization", authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ petId: PET_ID, modelSource: "real", insights: [{ type: "all_good" }] });
  });

  it("422 quando o pet não tem os dispositivos", async () => {
    prismaMock.device.findMany.mockResolvedValue([]);

    const res = await request(app).get(`/api/pets/${PET_ID}/insights`).set("Authorization", authHeader());

    expect(res.status).toBe(422);
  });

  it("503 quando a IA está fora do ar", async () => {
    prismaMock.device.findMany.mockResolvedValue(ALL_DEVICES);
    prismaMock.$queryRaw.mockResolvedValue([
      { slot: slot(0), type: "FOOD_BOWL", weight: 800, intensity: null },
      { slot: slot(0), type: "WATER_BOWL", weight: 950, intensity: null },
      { slot: slot(0), type: "COLLAR", weight: null, intensity: 0.4 },
    ]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).get(`/api/pets/${PET_ID}/insights`).set("Authorization", authHeader());

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Serviço de IA indisponível no momento");
  });

  it("exige login", async () => {
    const res = await request(app).get(`/api/pets/${PET_ID}/insights`);
    expect(res.status).toBe(401);
  });
});
