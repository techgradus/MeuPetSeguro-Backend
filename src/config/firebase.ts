import { initializeApp, getApps, getApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getMessaging as getAdminMessaging, type Messaging } from "firebase-admin/messaging";
import { readFileSync } from "fs";

let messaging: Messaging | null = null;
let initialized = false;

const loadServiceAccount = (): ServiceAccount | null => {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64) return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) return JSON.parse(json);

  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath) return JSON.parse(readFileSync(filePath, "utf8"));

  return null;
};

/**
 * Inicializa o Firebase Admin só na primeira vez que alguém pede.
 * Sem credencial configurada o push fica desligado (o resto do backend segue normal,
 * e os testes não precisam de Firebase).
 */
export const getMessaging = (): Messaging | null => {
  if (initialized) return messaging;
  initialized = true;

  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      console.warn("[Push] Credencial do Firebase não configurada — notificações push desativadas.");
      return null;
    }

    const app = getApps().length ? getApp() : initializeApp({ credential: cert(serviceAccount) });
    messaging = getAdminMessaging(app);
    console.log("[Push] Firebase Admin inicializado.");
  } catch (error) {
    console.error("[Push] Falha ao inicializar o Firebase:", (error as Error).message);
    messaging = null;
  }

  return messaging;
};

export const isPushEnabled = () => getMessaging() !== null;