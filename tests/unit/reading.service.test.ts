import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../prismaMock";
import { ingestTelemetry } from "../../src/services/reading.service";
import { PET_ID } from "../helpers";

vi.mock("../../src/services/push.service", () => ({ notifyAlert: vi.fn() }));

const COLLAR = { id: "coleira-1", type: "COLLAR", petId: PET_ID, pet: { id: PET_ID, name: "Rex" } };

// Horários em UTC; Brasília = UTC-3
const AT_15H_BRT = "2026-11-08T18:00:00.000Z";
const AT_23H_BRT = "2026-11-09T02:00:00.000Z";

const rest = (recordedAt: string) => ingestTelemetry("COLEIRA-01", { activityLevel: "REPOUSO", intensity: 0.05, recordedAt });

const setup = ({
  monitoredBefore = true,
  recentActivity = false,
  routine = null as { total: number; active: number } | null,
} = {}) => {
  prismaMock.device.findUnique.mockResolvedValue(COLLAR);
  prismaMock.sensorReading.findFirst
    .mockResolvedValueOnce(monitoredBefore ? { id: "antiga" } : null)
    .mockResolvedValueOnce(recentActivity ? { id: "ativa" } : null);
  prismaMock.$queryRaw.mockResolvedValue([
    { total: BigInt(routine?.total ?? 0), active: BigInt(routine?.active ?? 0) },
  ]);
  prismaMock.alert.findFirst.mockResolvedValue(null);
  prismaMock.alert.create.mockResolvedValue({ id: "alerta" });
};

describe("alerta de inatividade", () => {
  beforeEach(() => {
    prismaMock.sensorReading.findFirst.mockReset();
  });

  it("alerta quando o pet está parado num horário em que costuma estar ativo", async () => {
    setup({ routine: { total: 84, active: 78 } });

    await rest(AT_15H_BRT);

    expect(prismaMock.alert.create).toHaveBeenCalledWith({
      data: {
        petId: PET_ID,
        type: "INACTIVITY",
        message: "Rex está em repouso há mais de 60 minutos num horário em que costuma estar ativo",
      },
    });
  });

  it("não alerta no horário em que o pet costuma descansar (ex.: soneca da tarde)", async () => {
    setup({ routine: { total: 84, active: 3 } });

    await rest(AT_15H_BRT);

    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });

  it("sem histórico, não alerta de noite", async () => {
    setup({ routine: { total: 0, active: 0 } });

    await rest(AT_23H_BRT);

    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });

  it("sem histórico, alerta durante o dia", async () => {
    setup({ routine: { total: 0, active: 0 } });

    await rest(AT_15H_BRT);

    expect(prismaMock.alert.create).toHaveBeenCalledTimes(1);
  });

  it("consulta a rotina na hora local de Brasília", async () => {
    setup({ routine: { total: 84, active: 78 } });

    await rest(AT_15H_BRT);

    const values = prismaMock.$queryRaw.mock.calls[0].slice(1);
    expect(values).toContain(15);
    expect(values).toContain(-3);
  });

  it("não alerta se a coleira começou a mandar dados há menos de 1 hora", async () => {
    setup({ monitoredBefore: false, routine: { total: 84, active: 78 } });

    await rest(AT_15H_BRT);

    expect(prismaMock.alert.create).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("não alerta se houve atividade na última hora", async () => {
    setup({ recentActivity: true, routine: { total: 84, active: 78 } });

    await rest(AT_15H_BRT);

    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });

  it("leitura com atividade não dispara a checagem", async () => {
    setup();

    await ingestTelemetry("COLEIRA-01", { activityLevel: "INTENSA", intensity: 0.8, recordedAt: AT_15H_BRT });

    expect(prismaMock.sensorReading.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });
});
