import { AlertType, DeviceType, DeviceStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { TelemetryInput, StatusInput } from "../validators/reading.validator";

// Limiares simples pra MVP — ajustar depois com dado real (ou deixar configurável por pet).
const LOW_FOOD_THRESHOLD_G = 80;
const LOW_WATER_THRESHOLD_G = 100;
const INACTIVITY_WINDOW_MIN = 60;

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

  await prisma.alert.create({ data: { petId, type, message } });
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

  if (device.type === DeviceType.COLLAR && data.activityLevel === "REPOUSO") {
    const recentActivity = await prisma.sensorReading.findFirst({
      where: {
        deviceId: device.id,
        activityLevel: { not: "REPOUSO" },
        recordedAt: { gte: new Date(Date.now() - INACTIVITY_WINDOW_MIN * 60 * 1000) },
      },
    });

    if (!recentActivity) {
      await createAlertIfNotDuplicate(
        device.petId,
        AlertType.INACTIVITY,
        `${device.pet.name} está em repouso há mais de ${INACTIVITY_WINDOW_MIN} minutos sem atividade registrada`,
        INACTIVITY_WINDOW_MIN * 60 * 1000
      );
    }
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
