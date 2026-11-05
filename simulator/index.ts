import "dotenv/config";
import { prisma } from "../src/config/prisma";
import { DeviceFleet, SimDevice } from "./fleet";
import { connectSimulator, publishJson } from "./mqttClient";
import { Scenario, SCENARIOS } from "./routine";

/**
 * Simulador dos dispositivos vinculados aos pets.
 * Uso:
 *   npm run mqtt:simulate
 *   npm run mqtt:simulate -- --scenario doente        (normal | doente | sede)
 *   npm run mqtt:simulate -- --pet <petId>            (só um pet)
 *   npm run mqtt:simulate -- --exclude CODIGO1,CODIGO2 (códigos de dispositivos reais, a não simular)
 */
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const intervalS = Number(process.env.SIM_INTERVAL_S ?? 30);
const syncS = Number(process.env.SIM_SYNC_S ?? 10);
const onlyPet = arg("pet") ?? process.env.SIM_ONLY_PET;
const exclude = new Set(
  (arg("exclude") ?? process.env.SIM_EXCLUDE_CODES ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
);

const scenario = (arg("scenario") ?? process.env.SIM_SCENARIO ?? "normal") as Scenario;
if (!SCENARIOS.includes(scenario)) {
  console.error(`Cenário inválido "${scenario}". Use: ${SCENARIOS.join(" | ")}`);
  process.exit(1);
}

const loadDevices = async (): Promise<SimDevice[]> => {
  const devices = await prisma.device.findMany({
    where: onlyPet ? { petId: onlyPet } : undefined,
    select: { deviceCode: true, type: true, petId: true, pet: { select: { name: true } } },
  });

  return devices
    .filter((d) => !exclude.has(d.deviceCode.toUpperCase()))
    .map((d) => ({ deviceCode: d.deviceCode, type: d.type, petId: d.petId, petName: d.pet.name }));
};

const main = () => {
  const client = connectSimulator("dispositivos");
  const fleet = new DeviceFleet((topic, payload) => publishJson(client, topic, payload), scenario);
  const names = new Map<string, string>();

  const sync = async () => {
    try {
      const devices = await loadDevices();
      devices.forEach((d) => names.set(d.deviceCode, `${d.type} de ${d.petName}`));

      const { added, removed } = fleet.sync(devices);
      added.forEach((code) => console.log(`[sim] + ${code} (${names.get(code)}) ficou ONLINE`));
      removed.forEach((code) => console.log(`[sim] - ${code} foi desvinculado, ficou OFFLINE`));

      if (added.length) fleet.tick(); // primeira leitura logo que o dispositivo "liga"
    } catch (error) {
      console.error("[sim] erro ao consultar os dispositivos no banco:", (error as Error).message);
    }
  };

  const tick = () => {
    if (!fleet.size) return;
    const snapshots = fleet.tick();
    console.log(`[sim] leituras publicadas: ${fleet.size} dispositivo(s) em ${snapshots.size} pet(s)`);
  };

  client.on("connect", () => {
    void sync();
  });
  setInterval(() => void sync(), syncS * 1000);
  setInterval(tick, intervalS * 1000);

  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    console.log("\n[sim] encerrando: marcando os dispositivos como OFFLINE...");
    fleet.shutdown();
    client.end(false, {}, () => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(
    `Simulador de dispositivos rodando (cenário: ${scenario}; leitura a cada ${intervalS}s). Ctrl+C para parar.\n` +
      "Vincule uma coleira, um pote de comida ou de água a um pet no app e ele aparece aqui sozinho.\n"
  );
};

main();