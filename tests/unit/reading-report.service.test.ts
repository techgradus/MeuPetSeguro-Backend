import { describe, expect, it } from "vitest";
import { prismaMock } from "../prismaMock";
import { getActivityReport, getConsumptionReport, getLatestReadings } from "../../src/services/reading-report.service";

const NOW = new Date("2026-10-20T15:00:00.000Z").getTime(); // 12:00 em Brasília
const PET = { id: "pet-1", tutorId: "user-1", name: "Rex" };

const device = (overrides: Record<string, unknown> = {}) => ({
  id: "dev-1",
  type: "COLLAR",
  status: "ONLINE",
  batteryLevel: 80,
  lastSyncAt: new Date(NOW - 60_000),
  ...overrides,
});

const asPetOf = (tutorId: string) => prismaMock.pet.findUnique.mockResolvedValue({ ...PET, tutorId });

describe("getLatestReadings", () => {
  it("nega acesso ao pet de outro tutor", async () => {
    asPetOf("outra-pessoa");
    await expect(getLatestReadings("pet-1", "user-1")).rejects.toThrow();
    expect(prismaMock.device.findMany).not.toHaveBeenCalled();
  });

  it("pet sem dispositivos: tudo nulo", async () => {
    asPetOf("user-1");
    prismaMock.device.findMany.mockResolvedValue([]);

    const result = await getLatestReadings("pet-1", "user-1");

    expect(result).toEqual({ petId: "pet-1", collar: null, foodBowl: null, waterBowl: null });
    expect(prismaMock.sensorReading.findFirst).not.toHaveBeenCalled();
  });

  it("devolve a última leitura de cada dispositivo e a porcentagem dos potes", async () => {
    asPetOf("user-1");
    prismaMock.device.findMany.mockResolvedValue([
      device({ id: "c1", type: "COLLAR" }),
      device({ id: "f1", type: "FOOD_BOWL", status: "OFFLINE", batteryLevel: 55 }),
      device({ id: "w1", type: "WATER_BOWL", batteryLevel: 30 }),
    ]);
    prismaMock.sensorReading.findFirst
      .mockResolvedValueOnce({ activityLevel: "LEVE", intensity: 0.2, recordedAt: new Date(NOW - 120_000) })
      .mockResolvedValueOnce({ weightGrams: 450.04, recordedAt: new Date(NOW - 180_000) })
      .mockResolvedValueOnce({ weightGrams: 800, recordedAt: new Date(NOW - 240_000) });

    const result = await getLatestReadings("pet-1", "user-1");

    expect(result.collar).toMatchObject({ online: true, batteryLevel: 80, activityLevel: "LEVE", intensity: 0.2 });
    expect(result.foodBowl).toMatchObject({ online: false, weightGrams: 450, percent: 50, batteryLevel: 55 });
    expect(result.waterBowl).toMatchObject({ online: true, weightGrams: 800, percent: 80 });
    expect(result.collar!.recordedAt).toBe(new Date(NOW - 120_000).toISOString());
  });

  it("dispositivo vinculado que ainda não enviou leitura: dados nulos", async () => {
    asPetOf("user-1");
    prismaMock.device.findMany.mockResolvedValue([device({ id: "f1", type: "FOOD_BOWL", status: "OFFLINE" })]);
    prismaMock.sensorReading.findFirst.mockResolvedValue(null);

    const result = await getLatestReadings("pet-1", "user-1");

    expect(result.foodBowl).toMatchObject({ online: false, weightGrams: null, percent: null, recordedAt: null });
    expect(result.collar).toBeNull();
  });

  it("vários dispositivos do mesmo tipo: online se algum estiver, bateria é a menor", async () => {
    asPetOf("user-1");
    prismaMock.device.findMany.mockResolvedValue([
      device({ id: "c1", status: "OFFLINE", batteryLevel: 90 }),
      device({ id: "c2", status: "ONLINE", batteryLevel: 40 }),
    ]);
    prismaMock.sensorReading.findFirst.mockResolvedValue(null);

    const result = await getLatestReadings("pet-1", "user-1");
    expect(result.collar).toMatchObject({ online: true, batteryLevel: 40 });
  });
});

describe("getActivityReport", () => {
  it("sem coleira: relatório vazio com hasDevice false (não consulta as leituras)", async () => {
    asPetOf("user-1");
    prismaMock.device.findMany.mockResolvedValue([]);

    const report = await getActivityReport("pet-1", "user-1", "today", NOW);

    expect(report.hasDevice).toBe(false);
    expect(report.hasData).toBe(false);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("monta o relatório a partir das janelas de 5 minutos do banco", async () => {
    asPetOf("user-1");
    prismaMock.device.findMany.mockResolvedValue([{ id: "c1" }]);
    const start = new Date("2026-10-20T10:00:00.000Z"); // 07:00 em Brasília
    prismaMock.$queryRaw.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ slot: new Date(start.getTime() + i * 300_000), value: "0.7" }))
    );

    const report = await getActivityReport("pet-1", "user-1", "today", NOW);

    expect(report.hasDevice).toBe(true);
    expect(report.hasData).toBe(true);
    expect(report.activeMinutes).toBe(60);
    expect(report.intenseMinutes).toBe(60);
    expect(report.peak?.minutes).toBe(60);
  });
});

describe("getConsumptionReport", () => {
  it("nega acesso ao pet de outro tutor", async () => {
    asPetOf("outra-pessoa");
    await expect(getConsumptionReport("pet-1", "user-1", "food", NOW)).rejects.toThrow();
  });

  it("sem pote: relatório vazio com a capacidade", async () => {
    asPetOf("user-1");
    prismaMock.device.findMany.mockResolvedValue([]);

    const report = await getConsumptionReport("pet-1", "user-1", "water", NOW);

    expect(report).toMatchObject({ kind: "water", hasDevice: false, hasData: false, capacity: 1000, percent: null });
  });

  it("calcula o consumo a partir das janelas do pote de comida", async () => {
    asPetOf("user-1");
    prismaMock.device.findMany.mockResolvedValue([{ id: "f1" }]);
    const t = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00.000Z`); // UTC
    prismaMock.$queryRaw.mockResolvedValue([
      { slot: t("10:00"), value: 900 },
      { slot: t("10:05"), value: 860 },
      { slot: t("10:10"), value: 820 },
      { slot: t("10:15"), value: 820 },
    ]);

    const report = await getConsumptionReport("pet-1", "user-1", "food", NOW);

    expect(report.hasDevice).toBe(true);
    expect(report.percent).toBe(91);
    expect(report.events).toEqual([{ kind: "consumption", at: t("10:05").toISOString(), amount: 80 }]);
  });
});