import { connectSimulator, publishJson } from "./mqttClient";

type ActivityLevel = "REPOUSO" | "LEVE" | "MODERADA" | "INTENSA";

// Perfil de atividade por hora do dia (0h a 23h), baseado numa rotina típica de cão doméstico.
const HOURLY_PROFILE: ActivityLevel[] = [
  "REPOUSO", "REPOUSO", "REPOUSO", "REPOUSO", "REPOUSO", "REPOUSO", // 0h-5h: madrugada
  "MODERADA", "INTENSA", "MODERADA", // 6h-8h: passeio da manhã
  "LEVE", "LEVE", "LEVE", // 9h-11h: manhã calma
  "REPOUSO", "REPOUSO", // 12h-13h: soneca pós-almoço
  "LEVE", "MODERADA", "LEVE", "LEVE", // 14h-17h: tarde
  "INTENSA", "MODERADA", // 18h-19h: passeio/brincadeira da tarde
  "LEVE", "REPOUSO", "REPOUSO", "REPOUSO", // 20h-23h: desacelerando pra noite
];

const INTENSITY_RANGE: Record<ActivityLevel, [number, number]> = {
  REPOUSO: [0, 0.1],
  LEVE: [0.1, 0.35],
  MODERADA: [0.35, 0.65],
  INTENSA: [0.65, 1],
};

const randomInRange = ([min, max]: [number, number]) => min + Math.random() * (max - min);

export const runCollarSimulator = (deviceCode: string) => {
  // Comprime um "dia" simulado em poucos minutos reais, pra não precisar esperar 24h de verdade pra ver o padrão completo.
  const minutesPerSimDay = Number(process.env.SIM_MINUTES_PER_DAY ?? 10);
  const intervalMs = Number(process.env.SIM_INTERVAL_MS ?? 5000);
  // A cada N dias simulados, o cão fica anormalmente parado o dia todo — serve pra testar a detecção de anomalia da IA.
  const anomalyEveryNDays = Number(process.env.SIM_ANOMALY_EVERY_N_DAYS ?? 3);

  const client = connectSimulator("coleira");
  client.on("connect", () => publishJson(client, `meupet/${deviceCode}/status`, { status: "ONLINE" }));

  const startedAt = Date.now();
  const msPerSimDay = minutesPerSimDay * 60 * 1000;

  setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const simDayIndex = Math.floor(elapsed / msPerSimDay);
    const fractionOfDay = (elapsed % msPerSimDay) / msPerSimDay;
    const simHour = Math.min(23, Math.floor(fractionOfDay * 24));

    const isAnomalyDay = anomalyEveryNDays > 0 && (simDayIndex + 1) % anomalyEveryNDays === 0;
    const level: ActivityLevel = isAnomalyDay ? "REPOUSO" : HOURLY_PROFILE[simHour];
    const intensity = Number(randomInRange(INTENSITY_RANGE[level]).toFixed(2));
    // Bateria caindo lentamente ao longo da execução (~1% a cada 30 leituras), só pra enriquecer o dado.
    const batteryLevel = Math.max(10, 100 - Math.floor(elapsed / (1000 * 60 * 30)));

    publishJson(client, `meupet/${deviceCode}/telemetry`, {
      activityLevel: level,
      intensity,
      recordedAt: new Date().toISOString(),
      batteryLevel,
    });

    console.log(
      `[sim:coleira] dia ${simDayIndex + 1}${isAnomalyDay ? " (ANOMALIA)" : ""} ${simHour}h -> ${level} (${intensity})`
    );
  }, intervalMs);
};
