import { AlertType, DeviceType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { createAlertIfNotDuplicate } from "./reading.service";
import { findPetOrThrow } from "./pet.service";
import { AiMissingDevicesError, AiNoReadingsError, AiUnavailableError } from "../errors";

// Formato que o serviço de IA (ai-service/) espera: uma leitura por pet a cada 5 minutos.
export type AiReading = {
  pet_id: string;
  timestamp: string;
  food_g: number;
  water_ml: number;
  activity: number;
};

export type AiInsight = {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  data: Record<string, unknown>;
};

type InsightsResponse = {
  pet_id: string;
  model_version: string;
  model_source: string;
  insights: AiInsight[];
};

const SLOT_MINUTES = 5;
const DEFAULT_WINDOW_HOURS = 48;
const REQUEST_TIMEOUT_MS = 15_000;
// Mesmo insight da IA não vira alerta de novo dentro dessa janela
const AI_ALERT_DEDUP_MS = 6 * 60 * 60 * 1000;

const REQUIRED_DEVICES = [DeviceType.COLLAR, DeviceType.FOOD_BOWL, DeviceType.WATER_BOWL];

export const isAiEnabled = () => Boolean(process.env.AI_API_URL);

const aiUrl = (path: string) => `${process.env.AI_API_URL!.replace(/\/$/, "")}${path}`;

type SlotRow = { slot: Date; type: DeviceType; weight: number | null; intensity: number | null };

/**
 * Junta as leituras da coleira e dos dois potes de um pet em janelas de 5 minutos.
 * Peso dos potes = média da janela; atividade = intensidade média da coleira.
 * Janelas sem leitura de algum dispositivo repetem o último valor conhecido dele.
 * Retorna null se o pet não tem os 3 dispositivos.
 */
export const buildPetReadings = async (
  petId: string,
  since: Date = new Date(Date.now() - DEFAULT_WINDOW_HOURS * 60 * 60 * 1000)
): Promise<AiReading[] | null> => {
  const devices = await prisma.device.findMany({ where: { petId }, select: { type: true } });
  const types = new Set(devices.map((d) => d.type));
  if (!REQUIRED_DEVICES.every((t) => types.has(t))) return null;

  const rows = await prisma.$queryRaw<SlotRow[]>`
    SELECT date_bin(${`${SLOT_MINUTES} minutes`}::interval, r."recordedAt", TIMESTAMP '2000-01-01') AS slot,
           d.type,
           avg(r."weightGrams") AS weight,
           avg(r.intensity) AS intensity
    FROM sensor_readings r
    JOIN devices d ON d.id = r."deviceId"
    WHERE d."petId" = ${petId} AND r."recordedAt" >= ${since}
    GROUP BY slot, d.type
    ORDER BY slot`;

  const readings: AiReading[] = [];
  let food: number | null = null;
  let water: number | null = null;
  let activity: number | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.type === DeviceType.FOOD_BOWL && row.weight !== null) food = Number(row.weight);
    if (row.type === DeviceType.WATER_BOWL && row.weight !== null) water = Number(row.weight);
    if (row.type === DeviceType.COLLAR && row.intensity !== null) activity = Number(row.intensity);

    const lastOfSlot = rows[i + 1]?.slot.getTime() !== row.slot.getTime();
    if (lastOfSlot && food !== null && water !== null && activity !== null) {
      readings.push({
        pet_id: petId,
        timestamp: row.slot.toISOString(),
        food_g: Math.max(0, food),
        water_ml: Math.max(0, water), // 1 g de água ≈ 1 ml
        activity: Math.min(1, Math.max(0, activity)),
      });
    }
  }

  return readings;
};

const postToAi = async <T>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(aiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.AI_API_KEY ? { "X-Admin-Token": process.env.AI_API_KEY } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = (await res.json().catch(() => null)) as { detail?: unknown } | null;
  if (!res.ok) {
    throw new Error(`IA respondeu ${res.status}: ${data?.detail ?? "erro desconhecido"}`);
  }
  return data as T;
};

export const fetchInsights = async (readings: AiReading[]) =>
  postToAi<InsightsResponse>("/insights", { readings });

const formatHours = (hours: number) =>
  hours < 1 ? "menos de 1 hora" : `cerca de ${Math.round(hours)} hora${Math.round(hours) === 1 ? "" : "s"}`;

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * Converte um insight da IA em alerta. Retorna null para insights que não viram alerta:
 * - "all_good"
 * - pote baixo/vazio agora (food_low, water_empty...): já são gerados pelo reading.service
 *   na hora da leitura, com o limiar do hardware
 */
export const insightToAlert = (
  insight: AiInsight,
  petName: string
): { type: AlertType; message: string } | null => {
  switch (insight.type) {
    case "food_forecast":
    case "water_forecast": {
      const hours = Number(insight.data.hours_until_low);
      if (!Number.isFinite(hours)) return null;
      const isFood = insight.type === "food_forecast";
      return {
        type: isFood ? AlertType.LOW_FOOD : AlertType.LOW_WATER,
        message: `Previsão: ${isFood ? "a ração" : "a água"} de ${petName} deve acabar em ${formatHours(hours)}`,
      };
    }
    case "behavior_anomaly":
    case "water_drunk_ml_vs_baseline":
    case "food_eaten_g_vs_baseline":
    case "activity_vs_baseline":
    case "no_water":
      return { type: AlertType.ACTIVITY_ANOMALY, message: `${petName}: ${lowerFirst(insight.message)}` };
    default:
      return null;
  }
};

/** Insights da IA para a tela do app (só consulta, não cria alertas). */
export const getPetInsights = async (petId: string, tutorId: string) => {
  await findPetOrThrow(petId, tutorId);
  if (!isAiEnabled()) throw new AiUnavailableError();

  const readings = await buildPetReadings(petId);
  if (!readings) throw new AiMissingDevicesError();
  if (readings.length === 0) throw new AiNoReadingsError();

  try {
    const result = await fetchInsights(readings);
    return { petId, modelVersion: result.model_version, modelSource: result.model_source, insights: result.insights };
  } catch (error) {
    console.error("[IA] Falha ao consultar insights:", (error as Error).message);
    throw new AiUnavailableError();
  }
};

/** Analisa um pet: monta as leituras, consulta a IA e cria os alertas. */
export const analyzePet = async (pet: { id: string; name: string }) => {
  const readings = await buildPetReadings(pet.id);
  if (!readings || readings.length === 0) return { skipped: true as const, insights: [] };

  const result = await fetchInsights(readings);

  for (const insight of result.insights) {
    const alert = insightToAlert(insight, pet.name);
    if (alert) {
      await createAlertIfNotDuplicate(pet.id, alert.type, alert.message, AI_ALERT_DEDUP_MS);
    }
  }

  return { skipped: false as const, insights: result.insights, modelSource: result.model_source };
};

/** Roda a análise para todos os pets com coleira e potes cadastrados. */
export const analyzeAllPets = async () => {
  const pets = await prisma.pet.findMany({
    where: { devices: { some: { type: DeviceType.COLLAR } } },
    select: { id: true, name: true },
  });

  let analyzed = 0;
  for (const pet of pets) {
    try {
      const { skipped } = await analyzePet(pet);
      if (!skipped) analyzed++;
    } catch (error) {
      console.error(`[IA] Falha ao analisar ${pet.name}:`, (error as Error).message);
    }
  }
  return { pets: pets.length, analyzed };
};

/** Envia o histórico de todos os pets para a IA re-treinar com dados reais. */
export const trainWithHistory = async (days: number) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const pets = await prisma.pet.findMany({ select: { id: true } });

  const readings: AiReading[] = [];
  for (const pet of pets) {
    readings.push(...((await buildPetReadings(pet.id, since)) ?? []));
  }
  if (readings.length === 0) {
    throw new Error("Nenhuma leitura encontrada. Rode o simulador ou npm run sim:history antes.");
  }

  return postToAi<{ version: string; n_hours: number; n_pets: number }>("/train", { readings });
};
