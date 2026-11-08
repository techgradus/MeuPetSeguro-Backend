import { DAY_MS, HOUR_MS, localDayKey, localHour, localWeekday, startOfLocalDay } from "./time";

/**
 * Análise das leituras dos sensores para as telas de Atividade e Alimentação.
 * Funções puras (sem banco): recebem "janelas" de 5 minutos já agregadas e devolvem os relatórios.
 */

export const SLOT_MINUTES = 5;
const SLOT_MS = SLOT_MINUTES * 60_000;
// Lacuna maior que isso entre duas janelas (dispositivo offline) interrompe a sequência
const MAX_GAP_MS = 15 * 60_000;

// Faixas de intensidade da coleira (mesmas dos níveis REPOUSO / LEVE / MODERADA / INTENSA)
export const REST_MAX_INTENSITY = 0.1;
export const ACTIVE_MIN_INTENSITY = 0.35;
export const INTENSE_MIN_INTENSITY = 0.65;

/** Uma janela de 5 minutos: `at` = início (ms UTC); `value` = intensidade média (0 a 1) ou peso médio (g). */
export type Slot = { at: number; value: number };

export type Period = "today" | "week";

const iso = (ms: number) => new Date(ms).toISOString();
const round1 = (n: number) => Math.round(n * 10) / 10;

/* ============================================================
   ATIVIDADE
============================================================ */

export type ActivityBucket = {
  start: string;
  localDate: string;
  /** Hora local de início do bloco (0, 2, 4...) no período "today"; null em "week". */
  localHour: number | null;
  weekday: number;
  activeMinutes: number;
  intenseMinutes: number;
  avgIntensity: number;
  hasData: boolean;
  intense: boolean;
};

export type ActivityEvent = { kind: "intense" | "rest"; start: string; minutes: number };

export type ActivityReport = {
  period: Period;
  hasDevice: boolean;
  hasData: boolean;
  from: string;
  to: string;
  /** Tempo com intensidade de moderada para cima. */
  activeMinutes: number;
  restMinutes: number;
  intenseMinutes: number;
  avgIntensity: number | null;
  /** Variação do tempo ativo em relação ao habitual (null se não há base de comparação). */
  variationPct: number | null;
  /** Maior sequência contínua de atividade no período. */
  peak: { start: string; minutes: number } | null;
  buckets: ActivityBucket[];
  events: ActivityEvent[];
};

export const periodStart = (period: Period, nowMs: number) =>
  period === "today" ? startOfLocalDay(nowMs) : startOfLocalDay(nowMs) - 6 * DAY_MS;

type Run = { start: number; minutes: number };

/** Sequências contiguas de janelas que cumprem `predicate` (tolera 1 janela sem leitura no meio). */
const runsOf = (slots: Slot[], predicate: (value: number) => boolean): Run[] => {
  const runs: Run[] = [];
  let start: number | null = null;
  let last = 0;

  const close = () => {
    if (start !== null) runs.push({ start, minutes: (last + SLOT_MS - start) / 60_000 });
    start = null;
  };

  for (const slot of slots) {
    if (!predicate(slot.value)) {
      close();
      continue;
    }
    if (start !== null && slot.at - last > 2 * SLOT_MS) close();
    if (start === null) start = slot.at;
    last = slot.at;
  }
  close();
  return runs;
};

const minutesWhere = (slots: Slot[], predicate: (value: number) => boolean) =>
  slots.filter((s) => predicate(s.value)).length * SLOT_MINUTES;

const isActive = (v: number) => v >= ACTIVE_MIN_INTENSITY;
const isIntense = (v: number) => v >= INTENSE_MIN_INTENSITY;
const isRest = (v: number) => v < REST_MAX_INTENSITY;

const inRange = (slots: Slot[], from: number, to: number) => slots.filter((s) => s.at >= from && s.at < to);

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export const buildActivityReport = (
  slots: Slot[],
  period: Period,
  nowMs: number,
  hasDevice = true
): ActivityReport => {
  const from = periodStart(period, nowMs);
  const current = inRange(slots, from, nowMs + 1);

  const activeMinutes = minutesWhere(current, isActive);

  // "Habitual": média dos 7 dias anteriores, até o mesmo horário (hoje) ou semana inteira (7 dias)
  let variationPct: number | null = null;
  if (period === "today") {
    const elapsed = nowMs - from;
    const previous: number[] = [];
    for (let k = 1; k <= 7; k++) {
      const window = inRange(slots, from - k * DAY_MS, from - k * DAY_MS + elapsed);
      if (window.length) previous.push(minutesWhere(window, isActive));
    }
    const usual = average(previous);
    if (previous.length && usual > 0) variationPct = Math.round(((activeMinutes - usual) / usual) * 100);
  } else {
    const previous = inRange(slots, from - 7 * DAY_MS, from);
    const usual = minutesWhere(previous, isActive);
    if (previous.length && usual > 0) variationPct = Math.round(((activeMinutes - usual) / usual) * 100);
  }

  // Blocos do gráfico: 12 blocos de 2 h (hoje) ou 7 dias (semana)
  const blockCount = period === "today" ? 12 : 7;
  const blockMs = period === "today" ? 2 * HOUR_MS : DAY_MS;
  const intenseBlockMin = period === "today" ? 30 : 60;

  const buckets: ActivityBucket[] = Array.from({ length: blockCount }, (_, i) => {
    const start = from + i * blockMs;
    const inside = inRange(current, start, start + blockMs);
    const intenseMinutes = minutesWhere(inside, isIntense);
    return {
      start: iso(start),
      localDate: localDayKey(start),
      localHour: period === "today" ? Math.round(localHour(start)) : null,
      weekday: localWeekday(start),
      activeMinutes: minutesWhere(inside, isActive),
      intenseMinutes,
      avgIntensity: Number(average(inside.map((s) => s.value)).toFixed(3)),
      hasData: inside.length > 0,
      intense: intenseMinutes >= intenseBlockMin,
    };
  });

  const activeRuns = runsOf(current, isActive);
  const peakRun = activeRuns.reduce<Run | null>((best, run) => (!best || run.minutes >= best.minutes ? run : best), null);

  const events: ActivityEvent[] = [
    ...activeRuns.filter((r) => r.minutes >= 10).map((r) => ({ kind: "intense" as const, ...r })),
    ...runsOf(current, isRest).filter((r) => r.minutes >= 30).map((r) => ({ kind: "rest" as const, ...r })),
  ]
    .sort((a, b) => b.start - a.start)
    .slice(0, 6)
    .map((e) => ({ kind: e.kind, start: iso(e.start), minutes: e.minutes }));

  return {
    period,
    hasDevice,
    hasData: current.length > 0,
    from: iso(from),
    to: iso(nowMs),
    activeMinutes,
    restMinutes: minutesWhere(current, isRest),
    intenseMinutes: minutesWhere(current, isIntense),
    avgIntensity: current.length ? Number(average(current.map((s) => s.value)).toFixed(3)) : null,
    variationPct,
    peak: peakRun ? { start: iso(peakRun.start), minutes: peakRun.minutes } : null,
    buckets,
    events,
  };
};

/* ============================================================
   CONSUMO (comida e água)
============================================================ */

export type BowlKind = "food" | "water";

export type ConsumptionEvent = { kind: "consumption" | "refill"; at: string; amount: number };

export type ConsumptionReport = {
  kind: BowlKind;
  hasDevice: boolean;
  hasData: boolean;
  capacity: number;
  current: number | null;
  percent: number | null;
  lastReadingAt: string | null;
  /** Consumo médio por dia (g ou ml), nos dias completos com leitura. */
  dailyAverage: number | null;
  /** Últimos 7 dias, do mais antigo até hoje. */
  daily: { date: string; weekday: number; consumed: number; hasData: boolean }[];
  events: ConsumptionEvent[];
};

// noise: queda de até isso é ruído da balança | minEpisode: consumo mínimo para virar evento
// refill: aumento mínimo para ser considerado reabastecimento
export const CONSUMPTION_RULES: Record<BowlKind, { noise: number; minEpisode: number; refill: number }> = {
  food: { noise: 2, minEpisode: 10, refill: 100 },
  water: { noise: 8, minEpisode: 20, refill: 100 },
};

type Episode = { start: number; last: number; amount: number };

export const buildConsumptionReport = (
  kind: BowlKind,
  slots: Slot[],
  capacity: number,
  nowMs: number,
  hasDevice = true
): ConsumptionReport => {
  const rules = CONSUMPTION_RULES[kind];
  const from = startOfLocalDay(nowMs) - 6 * DAY_MS;
  const window = inRange(slots, from, nowMs + 1);

  const episodes: Episode[] = [];
  const refills: { at: number; amount: number }[] = [];
  let episode: Episode | null = null;

  const flush = () => {
    if (episode && episode.amount >= rules.minEpisode) episodes.push(episode);
    episode = null;
  };

  for (let i = 1; i < window.length; i++) {
    const previous = window[i - 1];
    const slot = window[i];

    if (slot.at - previous.at > MAX_GAP_MS) {
      flush(); // dispositivo ficou sem enviar: não dá para saber o que aconteceu no intervalo
      continue;
    }

    const delta = slot.value - previous.value;
    if (delta < -rules.noise) {
      if (episode && slot.at - episode.last <= 2 * SLOT_MS) {
        episode.amount += -delta;
        episode.last = slot.at;
      } else {
        flush();
        episode = { start: slot.at, last: slot.at, amount: -delta };
      }
    } else if (delta >= rules.refill) {
      flush();
      refills.push({ at: slot.at, amount: delta });
    }
  }
  flush();

  const consumedByDay = new Map<string, number>();
  for (const e of episodes) {
    const key = localDayKey(e.start);
    consumedByDay.set(key, (consumedByDay.get(key) ?? 0) + e.amount);
  }
  const daysWithData = new Set(window.map((s) => localDayKey(s.at)));

  const daily = Array.from({ length: 7 }, (_, i) => {
    const day = from + i * DAY_MS;
    const date = localDayKey(day);
    return {
      date,
      weekday: localWeekday(day),
      consumed: Math.round(consumedByDay.get(date) ?? 0),
      hasData: daysWithData.has(date),
    };
  });

  // Média: só dias completos (antes de hoje) com leitura; se não houver, usa o dia de hoje
  const today = daily[daily.length - 1];
  const complete = daily.slice(0, -1).filter((d) => d.hasData);
  const dailyAverage = complete.length
    ? Math.round(average(complete.map((d) => d.consumed)))
    : today.consumed > 0
      ? today.consumed
      : null;

  const events: ConsumptionEvent[] = [
    ...episodes.map((e) => ({ kind: "consumption" as const, at: e.start, amount: e.amount })),
    ...refills.map((r) => ({ kind: "refill" as const, at: r.at, amount: r.amount })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 8)
    .map((e) => ({ kind: e.kind, at: iso(e.at), amount: Math.round(e.amount) }));

  const last = window[window.length - 1];
  const current = last ? round1(Math.max(0, last.value)) : null;

  return {
    kind,
    hasDevice,
    hasData: window.length > 0,
    capacity,
    current,
    percent: current === null || capacity <= 0 ? null : Math.min(100, Math.round((current / capacity) * 100)),
    lastReadingAt: last ? iso(last.at) : null,
    dailyAverage,
    daily,
    events,
  };
};