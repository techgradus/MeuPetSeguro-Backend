/**
 * Gera um histórico de leituras dos últimos N dias direto no banco, para a IA ter dados
 * de treino sem precisar deixar o simulador rodando por dias.
 *
 * Usa horário real (as leituras ficam no passado, terminando agora), com rotina de um cão:
 * refeições, goles de água, tutor reabastecendo os potes e atividade por hora do dia.
 * Alguns dias são anômalos ("doente": pouca atividade e comida; "sede": água em excesso).
 *
 * Uso:
 *   npm run sim:history                      -> 14 dias para todos os pets com coleira + 2 potes
 *   npm run sim:history -- --days 30 --pet <petId> --reset
 */
import "dotenv/config";
import { DeviceType, ActivityLevel, Prisma } from "@prisma/client";
import { prisma } from "../src/config/prisma";

const STEP_MIN = 5;
const BRAZIL_UTC_OFFSET_H = -3; // horário de Brasília (sem horário de verão desde 2019)

const FOOD_CAPACITY_G = 900;
const WATER_CAPACITY_G = 1000;
const FOOD_PER_DAY_G = 300;
const WATER_PER_DAY_G = 600;
const MEALS_H = [7, 12.5, 19];

// Nível de atividade por hora do dia (0h a 23h), mesma rotina do simulador da coleira
const HOURLY_PROFILE: ActivityLevel[] = [
  "REPOUSO", "REPOUSO", "REPOUSO", "REPOUSO", "REPOUSO", "REPOUSO",
  "MODERADA", "INTENSA", "MODERADA",
  "LEVE", "LEVE", "LEVE",
  "REPOUSO", "REPOUSO",
  "LEVE", "MODERADA", "LEVE", "LEVE",
  "INTENSA", "MODERADA",
  "LEVE", "REPOUSO", "REPOUSO", "REPOUSO",
];

const INTENSITY_RANGE: Record<ActivityLevel, [number, number]> = {
  REPOUSO: [0, 0.1],
  LEVE: [0.1, 0.35],
  MODERADA: [0.35, 0.65],
  INTENSA: [0.65, 1],
};

type Scenario = "normal" | "doente" | "sede";

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const round1 = (n: number) => Math.round(n * 10) / 10;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    days: Number(get("days") ?? 14),
    petId: get("pet"),
    reset: args.includes("--reset"),
    anomalyEvery: Number(get("anomaly-every") ?? 5),
  };
};

const scenarioOf = (day: number, anomalyEvery: number): Scenario => {
  if (anomalyEvery <= 0 || (day + 1) % anomalyEvery !== 0) return "normal";
  return ((day + 1) / anomalyEvery) % 2 === 1 ? "doente" : "sede";
};

const generateForPet = (devices: Record<DeviceType, string>, days: number, anomalyEvery: number) => {
  const rows: Prisma.SensorReadingCreateManyInput[] = [];
  const end = Math.floor(Date.now() / (STEP_MIN * 60_000)) * STEP_MIN * 60_000;
  const start = end - days * 24 * 60 * 60_000;

  let food = FOOD_CAPACITY_G;
  let water = WATER_CAPACITY_G;
  const summary: Record<Scenario, number> = { normal: 0, doente: 0, sede: 0 };
  let currentDay = -1;
  let meals: number[] = [];
  let scenario: Scenario = "normal";

  for (let t = start; t < end; t += STEP_MIN * 60_000) {
    const local = new Date(t + BRAZIL_UTC_OFFSET_H * 60 * 60_000);
    const day = Math.floor((t - start) / (24 * 60 * 60_000));
    const hour = local.getUTCHours() + local.getUTCMinutes() / 60;

    if (day !== currentDay) {
      currentDay = day;
      scenario = scenarioOf(day, anomalyEvery);
      summary[scenario]++;
      meals = MEALS_H.map((m) => m + rand(-0.4, 0.4));
    }

    const foodFactor = scenario === "doente" ? 0.3 : 1;
    const waterFactor = scenario === "sede" ? 2.2 : scenario === "doente" ? 0.6 : 1;
    const activityFactor = scenario === "doente" ? 0.4 : 1;

    // Tutor reabastece os potes
    if ((local.getUTCHours() === 8 || local.getUTCHours() === 18) && local.getUTCMinutes() === 0) {
      if (food < FOOD_CAPACITY_G * 0.5) food = FOOD_CAPACITY_G - rand(0, 20);
      if (water < WATER_CAPACITY_G * 0.6) water = WATER_CAPACITY_G - rand(0, 20);
    }

    // Refeição: come em ~15 min (3 leituras)
    const eating = meals.some((m) => hour >= m && hour < m + 0.25);
    if (eating) food = Math.max(0, food - ((FOOD_PER_DAY_G / MEALS_H.length) * foodFactor * rand(0.85, 1.15)) / 3);

    // Goles de água espalhados pelo dia
    const awake = hour >= 6 && hour < 23;
    if (Math.random() < (awake ? 0.12 : 0.015)) {
      water = Math.max(0, water - (WATER_PER_DAY_G / 18) * waterFactor * rand(0.6, 1.4));
    }

    const level: ActivityLevel = scenario === "doente" ? "REPOUSO" : HOURLY_PROFILE[local.getUTCHours()];
    const intensity = Math.min(1, rand(...INTENSITY_RANGE[level]) * activityFactor + (eating ? 0.15 : 0));
    const recordedAt = new Date(t);

    rows.push(
      { deviceId: devices.COLLAR, activityLevel: level, intensity: Number(intensity.toFixed(2)), recordedAt },
      { deviceId: devices.FOOD_BOWL, weightGrams: round1(Math.max(0, food + rand(-0.5, 0.5))), recordedAt },
      { deviceId: devices.WATER_BOWL, weightGrams: round1(Math.max(0, water + rand(-2, 2))), recordedAt }
    );
  }

  return { rows, summary };
};

const main = async () => {
  const { days, petId, reset, anomalyEvery } = parseArgs();

  const pets = await prisma.pet.findMany({
    where: petId ? { id: petId } : undefined,
    select: { id: true, name: true, devices: { select: { id: true, type: true } } },
  });

  for (const pet of pets) {
    const devices = Object.fromEntries(pet.devices.map((d) => [d.type, d.id])) as Record<DeviceType, string>;
    if (!devices.COLLAR || !devices.FOOD_BOWL || !devices.WATER_BOWL) {
      console.log(`- ${pet.name}: pulado (precisa de coleira, pote de comida e pote de água)`);
      continue;
    }

    if (reset) {
      const { count } = await prisma.sensorReading.deleteMany({ where: { deviceId: { in: Object.values(devices) } } });
      console.log(`- ${pet.name}: ${count} leituras antigas apagadas`);
    }

    const { rows, summary } = generateForPet(devices, days, anomalyEvery);
    for (let i = 0; i < rows.length; i += 5000) {
      await prisma.sensorReading.createMany({ data: rows.slice(i, i + 5000) });
    }
    console.log(
      `- ${pet.name}: ${rows.length} leituras em ${days} dias ` +
        `(normais: ${summary.normal}, doente: ${summary.doente}, sede: ${summary.sede})`
    );
  }

  await prisma.$disconnect();
};

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
