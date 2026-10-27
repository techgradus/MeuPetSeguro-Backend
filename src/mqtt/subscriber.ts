import { getMqttClient } from "../config/mqtt";
import { telemetrySchema, statusSchema } from "../validators/reading.validator";
import { ingestTelemetry, ingestStatus } from "../services/reading.service";

// Contrato de tópicos (mesmo pra dispositivo real ou simulador — o broker não diferencia):
//   meupet/{deviceCode}/telemetry  -> leitura de sensor (atividade ou peso)
//   meupet/{deviceCode}/status     -> heartbeat / online-offline do dispositivo
const TELEMETRY_TOPIC = "meupet/+/telemetry";
const STATUS_TOPIC = "meupet/+/status";

const parseDeviceCode = (topic: string) => topic.split("/")[1]?.toUpperCase() ?? "";

const describeError = (err: unknown): string => {
  const e = err as {
    message?: string;
    code?: string;
    errors?: { code?: string; address?: string; port?: number; message?: string }[];
  };

  if (e.errors?.length) {
    return e.errors
      .map((x) => `${x.code ?? x.message ?? "erro"} ${x.address ?? ""}:${x.port ?? ""}`.trim())
      .join(" | ");
  }

  return [e.code, e.message].filter(Boolean).join(" ") || String(err);
};

export const startMqttSubscriber = () => {
  if (!process.env.MQTT_BROKER_URL) {
    console.warn("[MQTT] MQTT_BROKER_URL não configurada — ingestão de sensores desativada.");
    return;
  }

  const client = getMqttClient();

  client.on("connect", () => {
    console.log("[MQTT] Conectado ao broker");
    client.subscribe([TELEMETRY_TOPIC, STATUS_TOPIC], (err) => {
      if (err) {
        console.error("[MQTT] Erro ao assinar tópicos:", err.message);
      } else {
        console.log(`[MQTT] Assinando ${TELEMETRY_TOPIC} e ${STATUS_TOPIC}`);
      }
    });
  });

  client.on("reconnect", () => console.log("[MQTT] Reconectando..."));
  client.on("error", (err) => console.error("[MQTT] Erro de conexão:", describeError(err)));

  client.on("message", async (topic, payload) => {
    const deviceCode = parseDeviceCode(topic);

    try {
      const json = JSON.parse(payload.toString());

      if (topic.endsWith("/telemetry")) {
        await ingestTelemetry(deviceCode, telemetrySchema.parse(json));
      } else if (topic.endsWith("/status")) {
        await ingestStatus(deviceCode, statusSchema.parse(json));
      }
    } catch (err) {
      console.error(`[MQTT] Payload inválido em "${topic}":`, (err as Error).message);
    }
  });
};