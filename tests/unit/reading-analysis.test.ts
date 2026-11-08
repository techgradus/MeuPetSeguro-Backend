import { describe, expect, it } from "vitest";
import {
  buildActivityReport,
  buildConsumptionReport,
  periodStart,
  Slot,
} from "../../src/utils/reading-analysis";
import { localDayKey, localHour, localWeekday, startOfLocalDay } from "../../src/utils/time";

// Horário de Brasília (UTC-3) -> instante em ms
const at = (day: string, time: string) => new Date(`${day}T${time}-03:00`).getTime();
const DAY = "2026-10-20"; // terça-feira
const NOW = at(DAY, "12:00:00");
const MIN = 60_000;

/** Janelas de 5 min entre dois horários locais; `value` pode variar com o horário. */
const slots = (day: string, from: string, to: string, value: number | ((ms: number) => number)): Slot[] => {
  const out: Slot[] = [];
  for (let t = at(day, `${from}:00`); t < at(day, `${to}:00`); t += 5 * MIN) {
    out.push({ at: t, value: typeof value === "number" ? value : value(t) });
  }
  return out;
};

describe("utils/time (horário de Brasília)", () => {
  it("converte data, hora e dia da semana locais", () => {
    expect(localDayKey(at(DAY, "23:30:00"))).toBe(DAY);
    expect(localDayKey(at(DAY, "00:10:00"))).toBe(DAY);
    expect(localHour(at(DAY, "07:30:00"))).toBe(7.5);
    expect(localWeekday(at(DAY, "10:00:00"))).toBe(2); // terça
  });

  it("início do dia local é meia-noite de Brasília (03:00 UTC)", () => {
    expect(new Date(startOfLocalDay(NOW)).toISOString()).toBe("2026-10-20T03:00:00.000Z");
    // 01:00 UTC ainda é o dia anterior em Brasília
    expect(localDayKey(new Date("2026-10-20T01:00:00Z").getTime())).toBe("2026-10-19");
  });
});

describe("buildActivityReport - hoje", () => {
  it("sem leituras: vazio, mas com os 12 blocos do gráfico", () => {
    const report = buildActivityReport([], "today", NOW, true);
    expect(report.hasData).toBe(false);
    expect(report.activeMinutes).toBe(0);
    expect(report.avgIntensity).toBeNull();
    expect(report.variationPct).toBeNull();
    expect(report.peak).toBeNull();
    expect(report.events).toEqual([]);
    expect(report.buckets).toHaveLength(12);
    expect(report.buckets.every((b) => !b.hasData)).toBe(true);
  });

  it("sem coleira: hasDevice false", () => {
    expect(buildActivityReport([], "today", NOW, false).hasDevice).toBe(false);
  });

  it("calcula tempo ativo, intenso e de repouso", () => {
    const data = [
      ...slots(DAY, "00:00", "06:00", 0.05), // repouso: 6 h
      ...slots(DAY, "06:00", "07:00", 0.5), // ativo
      ...slots(DAY, "07:00", "07:30", 0.8), // intenso
      ...slots(DAY, "07:30", "08:00", 0.5), // ativo
      ...slots(DAY, "08:00", "12:00", 0.2), // leve (nem ativo nem repouso)
    ];
    const report = buildActivityReport(data, "today", NOW);

    expect(report.hasData).toBe(true);
    expect(report.activeMinutes).toBe(120); // 06:00 às 08:00
    expect(report.intenseMinutes).toBe(30);
    expect(report.restMinutes).toBe(360);
  });

  it("agrupa em blocos de 2 h e marca o bloco intenso", () => {
    const data = [...slots(DAY, "06:00", "07:00", 0.5), ...slots(DAY, "07:00", "08:00", 0.8)];
    const report = buildActivityReport(data, "today", NOW);

    const bucket = report.buckets[3]; // 06h às 08h
    expect(bucket.localHour).toBe(6);
    expect(bucket.activeMinutes).toBe(120);
    expect(bucket.intenseMinutes).toBe(60);
    expect(bucket.intense).toBe(true);
    expect(bucket.avgIntensity).toBeCloseTo(0.65, 2);
    expect(report.buckets[0].hasData).toBe(false);
  });

  it("acha o pico (maior sequência ativa) e os eventos, do mais recente para o mais antigo", () => {
    const data = [
      ...slots(DAY, "00:00", "06:00", 0.05), // descanso de 6 h
      ...slots(DAY, "06:00", "06:20", 0.5), // atividade curta (20 min)
      ...slots(DAY, "06:20", "07:00", 0.2),
      ...slots(DAY, "07:00", "08:00", 0.7), // maior atividade (60 min)
      ...slots(DAY, "08:00", "09:00", 0.2),
    ];
    const report = buildActivityReport(data, "today", NOW);

    expect(report.peak).toEqual({ start: new Date(at(DAY, "07:00:00")).toISOString(), minutes: 60 });
    expect(report.events.map((e) => [e.kind, e.minutes])).toEqual([
      ["intense", 60],
      ["intense", 20],
      ["rest", 360],
    ]);
  });

  it("ignora sequências curtas demais para virar evento", () => {
    const data = [...slots(DAY, "10:00", "10:05", 0.7), ...slots(DAY, "10:05", "10:30", 0.2)];
    expect(buildActivityReport(data, "today", NOW).events).toEqual([]);
  });

  it("uma lacuna grande (dispositivo offline) interrompe a sequência", () => {
    const data = [...slots(DAY, "08:00", "08:30", 0.7), ...slots(DAY, "09:00", "09:30", 0.7)];
    const report = buildActivityReport(data, "today", NOW);
    expect(report.events.filter((e) => e.kind === "intense").map((e) => e.minutes)).toEqual([30, 30]);
    expect(report.peak?.minutes).toBe(30);
  });

  it("compara com o habitual dos 7 dias anteriores no mesmo horário", () => {
    const todayActive = slots(DAY, "06:00", "07:30", 0.5); // 90 min ativos até o meio-dia
    const previous: Slot[] = [];
    for (let k = 1; k <= 7; k++) {
      const day = new Date(at(DAY, "12:00:00") - k * 24 * 60 * MIN).toISOString();
      const key = localDayKey(new Date(day).getTime());
      previous.push(...slots(key, "06:00", "07:00", 0.5)); // 60 min ativos por dia
    }
    const report = buildActivityReport([...previous, ...todayActive], "today", NOW);
    expect(report.activeMinutes).toBe(90);
    expect(report.variationPct).toBe(50); // 90 contra 60
  });

  it("variação nula quando não há dias anteriores com leitura", () => {
    expect(buildActivityReport(slots(DAY, "06:00", "07:00", 0.5), "today", NOW).variationPct).toBeNull();
  });

  it("ignora leituras futuras", () => {
    const report = buildActivityReport(slots(DAY, "13:00", "14:00", 0.9), "today", NOW);
    expect(report.hasData).toBe(false);
  });
});

describe("buildActivityReport - 7 dias", () => {
  it("monta 7 blocos (um por dia local) até hoje", () => {
    expect(periodStart("week", NOW)).toBe(startOfLocalDay(NOW) - 6 * 24 * 60 * MIN);
    const report = buildActivityReport([], "week", NOW);
    expect(report.buckets).toHaveLength(7);
    expect(report.buckets[6].localDate).toBe(DAY);
    expect(report.buckets[6].weekday).toBe(2);
    expect(report.buckets[0].localDate).toBe("2026-10-14");
    expect(report.buckets[0].localHour).toBeNull();
  });

  it("soma o tempo ativo por dia e compara com a semana anterior", () => {
    const data: Slot[] = [];
    // semana anterior: 30 min ativos por dia (12 a 18/10)
    for (let d = 7; d <= 13; d++) {
      const key = localDayKey(at(DAY, "12:00:00") - d * 24 * 60 * MIN);
      data.push(...slots(key, "10:00", "10:30", 0.5));
    }
    // semana atual: 60 min ativos por dia
    for (let d = 0; d <= 6; d++) {
      const key = localDayKey(at(DAY, "12:00:00") - d * 24 * 60 * MIN);
      data.push(...slots(key, "07:00", "08:00", 0.5));
    }
    const report = buildActivityReport(data, "week", NOW);
    expect(report.activeMinutes).toBe(420);
    expect(report.buckets.every((b) => b.activeMinutes === 60)).toBe(true);
    expect(report.variationPct).toBe(100); // 420 contra 210
  });
});

describe("buildConsumptionReport - comida", () => {
  const ENCHE = 900;

  /** Pote cheio até as 07:00 e uma refeição que tira `eaten` g em 3 janelas. */
  const mealDay = (day: string, eaten: number): Slot[] => {
    const meal = (eaten / 3);
    return [
      ...slots(day, "00:00", "07:05", ENCHE),
      { at: at(day, "07:05:00"), value: ENCHE - meal },
      { at: at(day, "07:10:00"), value: ENCHE - 2 * meal },
      { at: at(day, "07:15:00"), value: ENCHE - eaten },
      ...slots(day, "07:20", "08:00", ENCHE - eaten),
    ];
  };

  it("sem leituras: sem nível, mas com os 7 dias zerados", () => {
    const report = buildConsumptionReport("food", [], ENCHE, NOW, true);
    expect(report.hasData).toBe(false);
    expect(report.current).toBeNull();
    expect(report.percent).toBeNull();
    expect(report.dailyAverage).toBeNull();
    expect(report.daily).toHaveLength(7);
    expect(report.daily[6].date).toBe(DAY);
    expect(report.events).toEqual([]);
  });

  it("nível atual e porcentagem vêm da última janela", () => {
    const data = [...slots(DAY, "08:00", "09:00", 450)];
    const report = buildConsumptionReport("food", data, ENCHE, NOW);
    expect(report.current).toBe(450);
    expect(report.percent).toBe(50);
    expect(report.lastReadingAt).toBe(new Date(at(DAY, "08:55:00")).toISOString());
  });

  it("detecta a refeição como um evento de consumo", () => {
    const report = buildConsumptionReport("food", mealDay(DAY, 99), ENCHE, NOW);
    expect(report.events).toEqual([
      { kind: "consumption", at: new Date(at(DAY, "07:05:00")).toISOString(), amount: 99 },
    ]);
    expect(report.daily[6].consumed).toBe(99);
  });

  it("ignora o ruído da balança", () => {
    const noisy = slots(DAY, "06:00", "10:00", (t) => 600 + (Math.floor(t / (5 * MIN)) % 2 === 0 ? 1 : -1));
    const report = buildConsumptionReport("food", noisy, ENCHE, NOW);
    expect(report.events).toEqual([]);
    expect(report.daily[6].consumed).toBe(0);
  });

  it("não conta como consumo uma queda pequena demais", () => {
    const data = [...slots(DAY, "06:00", "06:30", 600), ...slots(DAY, "06:30", "07:00", 595)]; // 5 g: abaixo do mínimo
    expect(buildConsumptionReport("food", data, ENCHE, NOW).events).toEqual([]);
  });

  it("reabastecimento vira evento próprio e não entra no consumo", () => {
    const data = [...slots(DAY, "07:00", "08:00", 200), ...slots(DAY, "08:00", "09:00", 880)];
    const report = buildConsumptionReport("food", data, ENCHE, NOW);
    expect(report.events).toEqual([
      { kind: "refill", at: new Date(at(DAY, "08:00:00")).toISOString(), amount: 680 },
    ]);
    expect(report.daily[6].consumed).toBe(0);
  });

  it("não conta queda ocorrida durante uma lacuna sem leituras", () => {
    const data = [...slots(DAY, "06:00", "07:00", 800), ...slots(DAY, "09:00", "10:00", 500)];
    const report = buildConsumptionReport("food", data, ENCHE, NOW);
    expect(report.events).toEqual([]);
  });

  it("média diária usa só dias completos com leitura", () => {
    const data: Slot[] = [];
    for (let d = 1; d <= 3; d++) {
      data.push(...mealDay(localDayKey(at(DAY, "12:00:00") - d * 24 * 60 * MIN), 300));
    }
    data.push(...mealDay(DAY, 99)); // hoje (incompleto) não entra na média
    const report = buildConsumptionReport("food", data.sort((a, b) => a.at - b.at), ENCHE, NOW);
    expect(report.dailyAverage).toBe(300);
    expect(report.daily.filter((d) => d.hasData)).toHaveLength(4);
  });

  it("sem dias anteriores, a média usa o consumo de hoje", () => {
    const report = buildConsumptionReport("food", mealDay(DAY, 99), ENCHE, NOW);
    expect(report.dailyAverage).toBe(99);
  });

  it("lista no máximo 8 eventos, os mais recentes primeiro", () => {
    const data: Slot[] = [];
    let level = 900;
    for (let hour = 0; hour < 12; hour++) {
      const base = at(DAY, `${String(hour).padStart(2, "0")}:00:00`);
      data.push({ at: base, value: level });
      level -= 40;
      data.push({ at: base + 5 * MIN, value: level }); // -40 g: um evento por hora
    }
    const report = buildConsumptionReport("food", data, 900, NOW);
    expect(report.events).toHaveLength(8);
    expect(new Date(report.events[0].at).getTime()).toBeGreaterThan(new Date(report.events[7].at).getTime());
  });
});

describe("buildConsumptionReport - água", () => {
  it("usa limites próprios: ruído de 8 ml e consumo mínimo de 20 ml", () => {
    const sip = [...slots(DAY, "10:00", "10:30", 900), { at: at(DAY, "10:30:00"), value: 850 }, ...slots(DAY, "10:35", "11:00", 850)];
    const report = buildConsumptionReport("water", sip, 1000, NOW);
    expect(report.events).toEqual([
      { kind: "consumption", at: new Date(at(DAY, "10:30:00")).toISOString(), amount: 50 },
    ]);
    expect(report.percent).toBe(85);

    const tiny = [...slots(DAY, "10:00", "10:30", 900), ...slots(DAY, "10:30", "11:00", 896)];
    expect(buildConsumptionReport("water", tiny, 1000, NOW).events).toEqual([]);
  });
});