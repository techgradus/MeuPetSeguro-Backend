
const OFFSET_H = Number(process.env.APP_UTC_OFFSET_H ?? -3);

/** Diferença do horário local para o UTC, em horas (padrão: Brasília, -3). */
export const UTC_OFFSET_H = OFFSET_H;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

const toLocal = (ms: number) => ms + OFFSET_H * HOUR_MS;
const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Data local no formato aaaa-mm-dd. */
export const localDayKey = (ms: number) => new Date(toLocal(ms)).toISOString().slice(0, 10);

export const startOfLocalDay = (ms: number) => {
  const local = toLocal(ms);
  return local - mod(local, DAY_MS) - OFFSET_H * HOUR_MS;
};

export const localHour = (ms: number) => mod(toLocal(ms), DAY_MS) / HOUR_MS;

export const localWeekday = (ms: number) => new Date(toLocal(ms)).getUTCDay();