/**
 * Re-treina o modelo de IA com as leituras reais do banco.
 *
 * Uso: npm run ai:train            -> últimos 30 dias
 *      npm run ai:train -- --days 14
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma";
import { isAiEnabled, trainWithHistory } from "../src/services/ai.service";

const main = async () => {
  if (!isAiEnabled()) throw new Error("Defina AI_API_URL no .env");

  const i = process.argv.indexOf("--days");
  const days = i >= 0 ? Number(process.argv[i + 1]) : 30;

  const result = await trainWithHistory(days);
  console.log(`Modelo ${result.version} treinado com ${result.n_hours}h de leituras de ${result.n_pets} pet(s)`);
  await prisma.$disconnect();
};

main().catch(async (error) => {
  console.error("Falha no treino:", (error as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
