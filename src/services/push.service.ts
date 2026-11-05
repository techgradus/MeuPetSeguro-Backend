import { AlertType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { getMessaging, isPushEnabled } from "../config/firebase";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>; // FCM só aceita string nos valores de "data"
};

// Mesmos títulos que o app mostra na tela de alertas
const alertTitle = (type: AlertType, message: string): string => {
  switch (type) {
    case AlertType.LOW_FOOD: return "Nível de comida baixo";
    case AlertType.LOW_WATER: return "Nível de água baixo";
    case AlertType.INACTIVITY: return "Pouca atividade";
    case AlertType.ACTIVITY_ANOMALY: return "Mudança no padrão";
    case AlertType.DEVICE_OFFLINE: return "Dispositivo desconectado";
    case AlertType.VACCINE_DUE: return /atrasad/i.test(message) ? "Vacina atrasada" : "Próxima dose em breve";
    default: return "Meu Pet Seguro";
  }
};

// Erros do FCM que significam "esse token não existe mais" -> apagamos do banco
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export const registerPushToken = async (userId: string, data: { token: string; platform: string }) => {
  // O mesmo aparelho pode trocar de conta: o token passa a pertencer a quem logou por último
  await prisma.pushToken.upsert({
    where: { token: data.token },
    update: { userId, platform: data.platform },
    create: { token: data.token, platform: data.platform, userId },
  });
};

export const removePushToken = async (userId: string, token: string) => {
  await prisma.pushToken.deleteMany({ where: { token, userId } });
};

export const sendPushToUser = async (userId: string, payload: PushPayload) => {
  const messaging = getMessaging();
  if (!messaging) return { sent: 0, failed: 0 };

  const rows = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
  const tokens = rows.map((r) => r.token);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: payload.title, body: payload.body },
    data: payload.data,
    android: {
      priority: "high",
      notification: { channelId: "alerts" },
    },
  });

  const dead: string[] = [];
  response.responses.forEach((r, i) => {
    if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) dead.push(tokens[i]);
  });
  if (dead.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
  }

  return { sent: response.successCount, failed: response.failureCount };
};

/**
 * Chamada logo depois de criar um alerta: avisa o tutor do pet no celular.
 * Nunca lança erro — falha de push não pode quebrar a ingestão de telemetria nem a IA.
 */
export const notifyAlert = async (alert: { id: string; type: AlertType; petId: string; message: string } | null | undefined) => {
  if (!alert || !isPushEnabled()) return;

  try {
    const pet = await prisma.pet.findUnique({ where: { id: alert.petId }, select: { tutorId: true } });
    if (!pet) return;

    await sendPushToUser(pet.tutorId, {
      title: alertTitle(alert.type, alert.message),
      body: alert.message,
      data: { alertId: alert.id, petId: alert.petId, type: alert.type },
    });
  } catch (error) {
    console.error("[Push] Erro ao enviar notificação do alerta:", (error as Error).message);
  }
};
