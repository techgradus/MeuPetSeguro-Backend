import mqtt, { MqttClient } from "mqtt";
import "dotenv/config";


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

export const connectSimulator = (label: string): MqttClient => {
  const url = process.env.MQTT_BROKER_URL;

  if (!url) {
    throw new Error("Defina MQTT_BROKER_URL no .env antes de rodar o simulador");
  }

  const client = mqtt.connect(url, {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clientId: `simulador-${label}-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => console.log(`[sim:${label}] conectado ao broker`));
  client.on("error", (err) => {
    const reason = describeError(err);
    const hint = reason.includes("ECONNREFUSED")
      ? ` — nenhum broker respondendo em ${url}. Inicie o Mosquitto (ou ajuste MQTT_BROKER_URL).`
      : "";
    console.error(`[sim:${label}] erro: ${reason}${hint}`);
  });

  return client;
};

export const publishJson = (client: MqttClient, topic: string, payload: object) => {
  client.publish(topic, JSON.stringify(payload), { qos: 1 });
};