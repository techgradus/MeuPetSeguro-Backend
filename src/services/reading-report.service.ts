import { DeviceStatus, DeviceType, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { findPetOrThrow } from "./pet.service";
import { DAY_MS, startOfLocalDay } from "../utils/time";
import {
  ActivityReport,
  BowlKind,
  buildActivityReport,
  buildConsumptionReport,
  ConsumptionReport,
  Period,
  periodStart,
  SLOT_MINUTES,
  Slot,
} from "../utils/reading-analysis";

const FOOD_CAPACITY_G = Number(process.env.FOOD_BOWL_CAPACITY_G ?? 900);
const WATER_CAPACITY_ML = Number(process.env.WATER_BOWL_CAPACITY_ML ?? 1000);

type SlotRow = { slot: Date; value: number | null };

const deviceIdsOfType = async (petId: string, type: DeviceType) => {
  const devices = await prisma.device.findMany({ where: { petId, type }, select: { id: true } });
  return devices.map((d: { id: string }) => d.id);
};

/** Leituras agrupadas em janelas de 5 minutos (média por janela). */
const fetchSlots = async (deviceIds: string[], since: Date, column: "intensity" | "weight"): Promise<Slot[]> => {
  if (deviceIds.length === 0) return [];
  const ids = Prisma.join(deviceIds);
  const interval = `${SLOT_MINUTES} minutes`;

  const rows =
    column === "intensity"
      ? await prisma.$queryRaw<SlotRow[]>`
          SELECT date_bin(${interval}::interval, r."recordedAt", TIMESTAMP '2000-01-01') AS slot,
                 avg(r.intensity) AS value
          FROM sensor_readings r
          WHERE r."deviceId" IN (${ids}) AND r."recordedAt" >= ${since} AND r.intensity IS NOT NULL
          GROUP BY slot ORDER BY slot`
      : await prisma.$queryRaw<SlotRow[]>`
          SELECT date_bin(${interval}::interval, r."recordedAt", TIMESTAMP '2000-01-01') AS slot,
                 avg(r."weightGrams") AS value
          FROM sensor_readings r
          WHERE r."deviceId" IN (${ids}) AND r."recordedAt" >= ${since} AND r."weightGrams" IS NOT NULL
          GROUP BY slot ORDER BY slot`;

  return rows
    .filter((r: SlotRow) => r.value !== null)
    .map((r: SlotRow) => ({ at: r.slot.getTime(), value: Number(r.value) }));
};


type DeviceLite = {
  id: string;
  type: DeviceType;
  status: DeviceStatus;
  batteryLevel: number | null;
  lastSyncAt: Date | null;
};

const summarizeDevices = (devices: DeviceLite[]) => {
  if (devices.length === 0) return null;
  const batteries = devices.map((d) => d.batteryLevel).filter((b): b is number => b !== null);
  const syncs = devices.map((d) => d.lastSyncAt?.getTime()).filter((t): t is number => t !== undefined);
  return {
    online: devices.some((d) => d.status === DeviceStatus.ONLINE),
    batteryLevel: batteries.length ? Math.min(...batteries) : null,
    lastSyncAt: syncs.length ? new Date(Math.max(...syncs)).toISOString() : null,
  };
};

/** Última leitura de cada dispositivo do pet (estado "agora" para a Home). */
export const getLatestReadings = async (petId: string, tutorId: string) => {
  await findPetOrThrow(petId, tutorId);

  const devices: DeviceLite[] = await prisma.device.findMany({
    where: { petId },
    select: { id: true, type: true, status: true, batteryLevel: true, lastSyncAt: true },
  });
  const ofType = (type: DeviceType) => devices.filter((d) => d.type === type);

  const collars = ofType(DeviceType.COLLAR);
  const collarReading = collars.length
    ? await prisma.sensorReading.findFirst({
        where: { deviceId: { in: collars.map((d) => d.id) }, intensity: { not: null } },
        orderBy: { recordedAt: "desc" },
      })
    : null;

  const bowl = async (type: DeviceType, capacity: number) => {
    const list = ofType(type);
    if (list.length === 0) return null;

    const reading = await prisma.sensorReading.findFirst({
      where: { deviceId: { in: list.map((d) => d.id) }, weightGrams: { not: null } },
      orderBy: { recordedAt: "desc" },
    });
    const weight = reading?.weightGrams ?? null;

    return {
      ...summarizeDevices(list)!,
      weightGrams: weight === null ? null : Math.round(weight * 10) / 10,
      percent: weight === null ? null : Math.min(100, Math.max(0, Math.round((weight / capacity) * 100))),
      recordedAt: reading ? reading.recordedAt.toISOString() : null,
    };
  };

  return {
    petId,
    collar: collars.length
      ? {
          ...summarizeDevices(collars)!,
          activityLevel: collarReading?.activityLevel ?? null,
          intensity: collarReading?.intensity ?? null,
          recordedAt: collarReading ? collarReading.recordedAt.toISOString() : null,
        }
      : null,
    foodBowl: await bowl(DeviceType.FOOD_BOWL, FOOD_CAPACITY_G),
    waterBowl: await bowl(DeviceType.WATER_BOWL, WATER_CAPACITY_ML),
  };
};

export const getActivityReport = async (
  petId: string,
  tutorId: string,
  period: Period,
  now: number = Date.now()
): Promise<ActivityReport> => {
  await findPetOrThrow(petId, tutorId);

  const ids = await deviceIdsOfType(petId, DeviceType.COLLAR);
  // busca também os 7 dias anteriores, usados para calcular a variação "em relação ao habitual"
  const since = new Date(periodStart(period, now) - 7 * DAY_MS);
  const slots = await fetchSlots(ids, since, "intensity");

  return buildActivityReport(slots, period, now, ids.length > 0);
};

/** Consumo de comida ou água dos últimos 7 dias (tela Alimentação). */
export const getConsumptionReport = async (
  petId: string,
  tutorId: string,
  kind: BowlKind,
  now: number = Date.now()
): Promise<ConsumptionReport> => {
  await findPetOrThrow(petId, tutorId);

  const type = kind === "food" ? DeviceType.FOOD_BOWL : DeviceType.WATER_BOWL;
  const capacity = kind === "food" ? FOOD_CAPACITY_G : WATER_CAPACITY_ML;

  const ids = await deviceIdsOfType(petId, type);
  const since = new Date(startOfLocalDay(now) - 6 * DAY_MS);
  const slots = await fetchSlots(ids, since, "weight");

  return buildConsumptionReport(kind, slots, capacity, now, ids.length > 0);
};