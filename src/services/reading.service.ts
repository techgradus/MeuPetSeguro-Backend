import { AlertType, DeviceType, DeviceStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { TelemetryInput, StatusInput } from "../validators/reading.validator";
import { notifyAlert } from "./push.service";
import { DAY_MS, localHour, UTC_OFFSET_H } from "../utils/time";

// Limiares simples pra MVP — ajustar depois com dado real (ou deixar configurável por pet).
const LOW_FOOD_THRESHOLD_G = 80;
const LOW_WATER_THRESHOLD_G = 100;
const INACTIVITY_WINDOW_MIN = 60;
const INACTIVITY_WINDOW_MS = INACTIVITY_WINDOW_MIN * 60 * 1000;

// Rotina usada para saber se o pet costuma estar ativo em determinado horário
const ROUTINE_DAYS = 7;
const MIN_ROUTINE_READINGS = 12;
const USUALLY_ACTIVE_RATIO = 0.5;
// Sem histórico suficiente, considera que das 22h às 6h o pet está dormindo
const DEFAULT_SLEEP_START_H = 22;
const DEFAULT_SLEEP_END_H = 6;

/**
 * O pet costuma estar ativo nesse horário? Olha as leituras da coleira na mesma hora do dia
 * nos últimos 7 dias. Assim, repouso à noite ou na soneca da tarde não vira alerta.
 */
const isUsuallyActiveAt = async (deviceId: string, at: Date) => {
  const hour = Math.floor(localHour(at.getTime()));

  const [routine] = await prisma.$queryRaw<{ total: bigint; active: bigint }[]>`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE "activityLevel" <> 'REPOUSO') AS active
    FROM sensor_readings
    WHERE "deviceId" = ${deviceId}
      AND "recordedAt" >= ${new Date(at.getTime() - ROUTINE_DAYS * DAY_MS)}
      AND "recordedAt" < ${new Date(at.getTime() - INACTIVITY_WINDOW_MS)}
      AND EXTRACT(HOUR FROM "recordedAt" + make_interval(hours => ${UTC_OFFSET_H})) = ${hour}`;

  const total = Number(routine?.total ?? 0);
  if (total < MIN_ROUTINE_READINGS) {
    return hour >= DEFAULT_SLEEP_END_H && hour < DEFAULT_SLEEP_START_H;
  }
  return Number(routine.active) / total >= USUALLY_ACTIVE_RATIO;
};

/**
 * Inatividade = coleira mandando dados há pelo menos 1h, só repouso nesse período,
 * e num horário em que o pet normalmente estaria ativo.
 */
const isUnexpectedlyInactive = async (deviceId: string, at: Date) => {
  const windowStart = new Date(at.getTime() - INACTIVITY_WINDOW_MS);

  // A coleira precisa já estar monitorando antes do início da janela
  const monitoredBefore = await prisma.sensorReading.findFirst({
    where: { deviceId, recordedAt: { lte: windowStart } },
    select: { id: true },
  });
  if (!monitoredBefore) return false;

  const recentActivity = await prisma.sensorReading.findFirst({
    where: { deviceId, activityLevel: { not: "REPOUSO" }, recordedAt: { gte: windowStart } },
    select: { id: true },
  });
  if (recentActivity) return false;

  return isUsuallyActiveAt(deviceId, at);
};

// Evita recriar o mesmo alerta a cada leitura (ex.: pote continua baixo por horas).
export const createAlertIfNotDuplicate = async (
  petId: string,
  type: AlertType,
  message: string,
  windowMs = 60 * 60 * 1000
) => {
  const recent = await prisma.alert.findFirst({
    where: { petId, type, createdAt: { gte: new Date(Date.now() - windowMs) } },
  });

  if (recent) return;

  const alert = await prisma.alert.create({ data: { petId, type, message } });

  // Avisa o tutor no celular (não bloqueia nem quebra a ingestão se o push falhar)
  void notifyAlert(alert);
};

export const ingestTelemetry = async (deviceCode: string, data: TelemetryInput) => {
  const device = await prisma.device.findUnique({
    where: { deviceCode },
    include: { pet: { select: { id: true, name: true } } },
  });

  if (!device) {
    console.warn(`[MQTT] Telemetria recebida de dispositivo não cadastrado: ${deviceCode}`);
    return;
  }

  const recordedAt = data.recordedAt ? new Date(data.recordedAt) : new Date();

  await prisma.sensorReading.create({
    data: {
      deviceId: device.id,
      activityLevel: data.activityLevel,
      intensity: data.intensity,
      weightGrams: data.weightGrams,
      recordedAt,
    },
  });

  await prisma.device.update({
    where: { id: device.id },
    data: {
      status: DeviceStatus.ONLINE,
      lastSyncAt: new Date(),
      ...(data.batteryLevel !== undefined ? { batteryLevel: data.batteryLevel } : {}),
    },
  });

  if (
    device.type === DeviceType.FOOD_BOWL &&
    data.weightGrams !== undefined &&
    data.weightGrams < LOW_FOOD_THRESHOLD_G
  ) {
    await createAlertIfNotDuplicate(
      device.petId,
      AlertType.LOW_FOOD,
      `O pote de comida de ${device.pet.name} está com pouca ração (${Math.round(data.weightGrams)}g restantes)`
    );
  }

  if (
    device.type === DeviceType.WATER_BOWL &&
    data.weightGrams !== undefined &&
    data.weightGrams < LOW_WATER_THRESHOLD_G
  ) {
    await createAlertIfNotDuplicate(
      device.petId,
      AlertType.LOW_WATER,
      `O pote de água de ${device.pet.name} está com pouca água (${Math.round(data.weightGrams)}g restantes)`
    );
  }

  if (
    device.type === DeviceType.COLLAR &&
    data.activityLevel === "REPOUSO" &&
    (await isUnexpectedlyInactive(device.id, recordedAt))
  ) {
    await createAlertIfNotDuplicate(
      device.petId,
      AlertType.INACTIVITY,
      `${device.pet.name} está em repouso há mais de ${INACTIVITY_WINDOW_MIN} minutos num horário em que costuma estar ativo`,
      INACTIVITY_WINDOW_MS
    );
  }

  // ACTIVITY_ANOMALY não é gerado aqui: é o modelo de IA (consumido via API) que analisa
  // o histórico de SensorReading e decide se o padrão está fora do normal. Esse serviço
  // só cuida da ingestão "crua" dos dados publicados no MQTT.
};

export const ingestStatus = async (deviceCode: string, data: StatusInput) => {
  const device = await prisma.device.findUnique({ where: { deviceCode } });

  if (!device) {
    console.warn(`[MQTT] Status recebido de dispositivo não cadastrado: ${deviceCode}`);
    return;
  }

  await prisma.device.update({
    where: { id: device.id },
    data: {
      status: data.status,
      lastSyncAt: new Date(),
      ...(data.batteryLevel !== undefined ? { batteryLevel: data.batteryLevel } : {}),
    },
  });

  if (data.status === DeviceStatus.OFFLINE) {
    await createAlertIfNotDuplicate(
      device.petId,
      AlertType.DEVICE_OFFLINE,
      `O dispositivo ${device.deviceCode} perdeu conexão`
    );
  }
};
