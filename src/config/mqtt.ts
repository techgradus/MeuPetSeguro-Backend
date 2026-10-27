import mqtt, { MqttClient } from "mqtt";

let client: MqttClient | null = null;

export const getMqttClient = (): MqttClient => {
  if (client) return client;

  const url = process.env.MQTT_BROKER_URL;

  if (!url) {
    throw new Error("MQTT_BROKER_URL não definida no .env");
  }

  client = mqtt.connect(url, {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clientId: `meupet-backend-${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 2000,
  });

  return client;
};
