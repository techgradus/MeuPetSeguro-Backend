import { analyzeAllPets, isAiEnabled } from "../services/ai.service";

/**
 * De tempos em tempos manda as leituras de cada pet para a IA e transforma
 * os insights em alertas (anomalia de comportamento, previsão de comida/água acabando).
 */
export const startAiAnalysisJob = () => {
  if (!isAiEnabled()) {
    console.warn("[IA] AI_API_URL não configurada — análise automática desativada.");
    return;
  }

  const intervalMin = Number(process.env.AI_ANALYSIS_INTERVAL_MIN ?? 10);
  let running = false;

  const run = async () => {
    if (running) return; // análise anterior ainda em andamento
    running = true;
    try {
      const { pets, analyzed } = await analyzeAllPets();
      console.log(`[IA] Análise concluída: ${analyzed}/${pets} pet(s) analisado(s)`);
    } catch (error) {
      console.error("[IA] Erro na análise automática:", (error as Error).message);
    } finally {
      running = false;
    }
  };

  console.log(`[IA] Análise automática a cada ${intervalMin} min`);
  setTimeout(run, 30_000); // primeira rodada logo após subir
  setInterval(run, intervalMin * 60 * 1000);
};
