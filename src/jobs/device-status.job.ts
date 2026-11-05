import { AlertType, DeviceStatus, DeviceType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { createAlertIfNotDuplicate } from "../services/reading.service";

const DEVICE_LABEL: Record<DeviceType, string> = {
  COLLAR: "colar",
  FOOD_BOWL: "pote de comida",
  WATER_BOWL: "pote de água",
};

const OFFLINE_ALERT_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Dispositivo que estava ONLINE mas não dá sinal (telemetria/status) há mais de
 * `staleAfterMin` minutos passa a OFFLINE e gera um alerta "dispositivo desconectado".
 * Vale para dispositivo real ou simulado: quem manda sinal volta a ficar ONLINE sozinho.
 */
export const markStaleDevicesOffline = async (staleAfterMin: number, now: number = Date.now()) => {
  const limit = new Date(now - staleAfterMin * 60_000);

  const stale = await prisma.device.findMany({
    where: {
      status: DeviceStatus.ONLINE,
      OR: [{ lastSyncAt: { lt: limit } }, { lastSyncAt: null }],
    },
    include: { pet: { select: { name: true } } },
  });

  for (const device of stale) {
    await prisma.device.update({ where: { id: device.id }, data: { status: DeviceStatus.OFFLINE } });

    await createAlertIfNotDuplicate(
      device.petId,
      AlertType.DEVICE_OFFLINE,
      `O ${DEVICE_LABEL[device.type]} de ${device.pet.name} está sem sinal há mais de ${staleAfterMin} minutos`,
      OFFLINE_ALERT_WINDOW_MS
    );
  }

  return stale.length;
};

export const startDeviceStatusJob = () => {
  const checkEveryMin = Number(process.env.DEVICE_STATUS_CHECK_INTERVAL_MIN ?? 1);
  const staleAfterMin = Number(process.env.DEVICE_OFFLINE_AFTER_MIN ?? 5);
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const count = await markStaleDevicesOffline(staleAfterMin);
      if (count > 0) console.log(`[Dispositivos] ${count} dispositivo(s) ficaram OFFLINE por falta de sinal`);
    } catch (error) {
      console.error("[Dispositivos] Erro ao verificar status:", (error as Error).message);
    } finally {
      running = false;
    }
  };

  setInterval(run, checkEveryMin * 60 * 1000);
};