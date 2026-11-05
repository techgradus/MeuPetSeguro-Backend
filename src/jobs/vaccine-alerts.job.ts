import { generateVaccineAlerts } from "../services/alert.service";

const TIMEZONE = "America/Sao_Paulo";

const nowInBrazil = () => {
  const now = new Date();
  return {
    day: now.toLocaleDateString("en-CA", { timeZone: TIMEZONE }),
    hour: Number(now.toLocaleTimeString("en-GB", { timeZone: TIMEZONE, hour: "2-digit", hour12: false })),
  };
};


export const startVaccineAlertsJob = () => {
  const targetHour = Number(process.env.VACCINE_PUSH_HOUR ?? 9);
  let lastRunDay = "";
  let running = false;

  const tick = async () => {
    if (running) return;
    const { day, hour } = nowInBrazil();
    if (hour !== targetHour || day === lastRunDay) return;

    running = true;
    try {
      const created = await generateVaccineAlerts({ notify: true });
      lastRunDay = day;
      console.log(`[Vacinas] Checagem diária concluída: ${created} alerta(s) novo(s)`);
    } catch (error) {
      console.error("[Vacinas] Erro na checagem diária:", (error as Error).message);
    } finally {
      running = false;
    }
  };

  setInterval(tick, 10 * 60 * 1000);
};
