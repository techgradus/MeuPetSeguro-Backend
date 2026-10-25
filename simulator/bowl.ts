import { connectSimulator, publishJson } from "./mqttClient";

type BowlKind = "food" | "water";

const CONFIG: Record<
  BowlKind,
  { label: string; fullGrams: number; refillBelowGrams: number; consumePerTick: [number, number] }
> = {
  food: { label: "pote-comida", fullGrams: 900, refillBelowGrams: 60, consumePerTick: [2, 8] },
  water: { label: "pote-agua", fullGrams: 1000, refillBelowGrams: 80, consumePerTick: [3, 12] },
};

export const runBowlSimulator = (kind: BowlKind, deviceCode: string) => {
  const cfg = CONFIG[kind];
  const intervalMs = Number(process.env.SIM_INTERVAL_MS ?? 5000);

  const client = connectSimulator(cfg.label);
  client.on("connect", () => publishJson(client, `meupet/${deviceCode}/status`, { status: "ONLINE" }));

  let weightGrams = cfg.fullGrams;
  let tickCount = 0;

  setInterval(() => {
    tickCount++;

    const [min, max] = cfg.consumePerTick;
    weightGrams -= min + Math.random() * (max - min);

    // Simula o tutor reabastecendo o pote quando ele esvazia (em vez de ficar negativo pra sempre).
    if (weightGrams <= cfg.refillBelowGrams) {
      weightGrams = cfg.fullGrams - Math.random() * 20;
      console.log(`[sim:${cfg.label}] reabastecido`);
    }

    const batteryLevel = Math.max(10, 100 - Math.floor(tickCount / 50));

    publishJson(client, `meupet/${deviceCode}/telemetry`, {
      weightGrams: Number(weightGrams.toFixed(1)),
      recordedAt: new Date().toISOString(),
      batteryLevel,
    });

    console.log(`[sim:${cfg.label}] ${weightGrams.toFixed(0)}g`);
  }, intervalMs);
};
