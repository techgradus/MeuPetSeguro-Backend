export type ActivityLevelName = "REPOUSO" | "LEVE" | "MODERADA" | "INTENSA";

/** normal: dia comum | doente: pouca atividade e comida | sede: bebe água em excesso */
export type Scenario = "normal" | "doente" | "sede";
export const SCENARIOS: Scenario[] = ["normal", "doente", "sede"];

export const BRAZIL_UTC_OFFSET_H = -3;

export const FOOD_CAPACITY_G = 900;
export const WATER_CAPACITY_G = 1000;
export const FOOD_PER_DAY_G = 300;
export const WATER_PER_DAY_G = 600;
export const MEALS_H = [7, 12.5, 19];
export const REFILL_HOURS = [8, 18];

// Nível de atividade por hora do dia (0h a 23h)
export const HOURLY_PROFILE: ActivityLevelName[] = [
  "REPOUSO", "REPOUSO", "REPOUSO", "REPOUSO", "REPOUSO", "REPOUSO",
  "MODERADA", "INTENSA", "MODERADA",
  "LEVE", "LEVE", "LEVE",
  "REPOUSO", "REPOUSO",
  "LEVE", "MODERADA", "LEVE", "LEVE",
  "INTENSA", "MODERADA",
  "LEVE", "REPOUSO", "REPOUSO", "REPOUSO",
];

export const INTENSITY_RANGE: Record<ActivityLevelName, [number, number]> = {
  REPOUSO: [0, 0.1],
  LEVE: [0.1, 0.35],
  MODERADA: [0.35, 0.65],
  INTENSA: [0.65, 1],
};

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Data (aaaa-mm-dd) e hora decimal (0 a 24) no horário de Brasília. */
export const localTime = (ms: number) => {
  const d = new Date(ms + BRAZIL_UTC_OFFSET_H * 60 * 60_000);
  return {
    day: d.toISOString().slice(0, 10),
    hour: d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600,
  };
};

export type RoutineSnapshot = {
  activityLevel: ActivityLevelName;
  intensity: number;
  foodGrams: number;
  waterGrams: number;
  eating: boolean;
};

/** Estado de um pet ao longo do dia (peso dos potes, refeições, reabastecimento). */
export class PetRoutine {
  foodGrams = FOOD_CAPACITY_G;
  waterGrams = WATER_CAPACITY_G;

  private lastMs: number | null = null;
  private day = "";
  private meals = [...MEALS_H];
  private refilled = new Set<number>();

  constructor(public scenario: Scenario = "normal") {}

  /** Avança o estado até `nowMs` e devolve a situação atual do pet. */
  advance(nowMs: number): RoutineSnapshot {
    const { day, hour } = localTime(nowMs);
    // Tempo desde a última chamada (limitado a 30 min, p.ex. se o simulador ficou pausado)
    const dtMin = this.lastMs === null ? 0 : Math.min(30, Math.max(0, (nowMs - this.lastMs) / 60_000));
    this.lastMs = nowMs;

    if (day !== this.day) {
      this.day = day;
      this.meals = MEALS_H.map((m) => m + rand(-0.4, 0.4));
      this.refilled.clear();
    }

    const foodFactor = this.scenario === "doente" ? 0.3 : 1;
    const waterFactor = this.scenario === "sede" ? 2.2 : this.scenario === "doente" ? 0.6 : 1;
    const activityFactor = this.scenario === "doente" ? 0.4 : 1;

    // Tutor reabastece os potes (uma vez por horário, por dia) se estiverem pela metade
    for (const slot of REFILL_HOURS) {
      if (hour >= slot && !this.refilled.has(slot)) {
        this.refilled.add(slot);
        if (this.foodGrams < FOOD_CAPACITY_G * 0.5) this.foodGrams = FOOD_CAPACITY_G - rand(0, 20);
        if (this.waterGrams < WATER_CAPACITY_G * 0.6) this.waterGrams = WATER_CAPACITY_G - rand(0, 20);
      }
    }

    // Refeição: come em ~15 min
    const eating = this.meals.some((m) => hour >= m && hour < m + 0.25);
    if (eating) {
      const perMeal = (FOOD_PER_DAY_G / MEALS_H.length) * foodFactor * rand(0.85, 1.15);
      this.foodGrams = Math.max(0, this.foodGrams - perMeal * (dtMin / 15));
    }

    // Goles de água espalhados pelo dia
    const awake = hour >= 6 && hour < 23;
    const sipChancePerMin = (awake ? 0.12 : 0.015) / 5;
    if (Math.random() < 1 - Math.pow(1 - sipChancePerMin, dtMin)) {
      this.waterGrams = Math.max(0, this.waterGrams - (WATER_PER_DAY_G / 18) * waterFactor * rand(0.6, 1.4));
    }

    const activityLevel: ActivityLevelName =
      this.scenario === "doente" ? "REPOUSO" : HOURLY_PROFILE[Math.min(23, Math.floor(hour))];
    const intensity = Math.min(1, rand(...INTENSITY_RANGE[activityLevel]) * activityFactor + (eating ? 0.15 : 0));

    return {
      activityLevel,
      intensity: Number(intensity.toFixed(2)),
      foodGrams: this.foodGrams,
      waterGrams: this.waterGrams,
      eating,
    };
  }
}