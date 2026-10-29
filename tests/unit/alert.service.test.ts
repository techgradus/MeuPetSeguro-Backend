import { describe, expect, it } from "vitest";
import { prismaMock } from "../prismaMock";
import { getAlertsByTutor, markAlertAsRead, markAllAlertsAsRead } from "../../src/services/alert.service";
import { daysFromNow, OTHER_TUTOR_ID, pet, PET_ID, TUTOR_ID } from "../helpers";

const vaccine = (overrides: Record<string, unknown> = {}) => ({
  id: "vac-1",
  name: "V10",
  petId: PET_ID,
  appliedAt: daysFromNow(-360),
  nextDoseAt: daysFromNow(3),
  pet: { name: "Rex" },
  ...overrides,
});

describe("geração de alertas de vacina (sob demanda)", () => {
  it("cria um alerta para vacina que vence nos próximos 7 dias", async () => {
    prismaMock.vaccine.findMany.mockResolvedValue([vaccine()]);
    prismaMock.vaccine.findFirst.mockResolvedValue(null);
    prismaMock.alert.findMany.mockResolvedValue([]);

    await getAlertsByTutor(TUTOR_ID, {});

    expect(prismaMock.alert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "VACCINE_DUE", petId: PET_ID, vaccineId: "vac-1" }),
    });
    expect(prismaMock.alert.create.mock.calls[0][0].data.message).toMatch(/^A vacina V10 de Rex vence em \d dia\(s\)/);
  });

  it("busca só vacinas sem alerta, até 7 dias à frente, dos pets do tutor", async () => {
    prismaMock.vaccine.findMany.mockResolvedValue([]);
    prismaMock.alert.findMany.mockResolvedValue([]);

    await getAlertsByTutor(TUTOR_ID, {});

    const where = prismaMock.vaccine.findMany.mock.calls[0][0].where;
    expect(where.alerts).toEqual({ none: { type: "VACCINE_DUE" } });
    expect(where.pet).toEqual({ tutorId: TUTOR_ID });
    const limitDays = (where.nextDoseAt.lte.getTime() - Date.now()) / 86_400_000;
    expect(limitDays).toBeCloseTo(7, 1);
  });

  it("vacina atrasada gera mensagem de atraso", async () => {
    prismaMock.vaccine.findMany.mockResolvedValue([vaccine({ name: "Raiva", nextDoseAt: daysFromNow(-5) })]);
    prismaMock.vaccine.findFirst.mockResolvedValue(null);
    prismaMock.alert.findMany.mockResolvedValue([]);

    await getAlertsByTutor(TUTOR_ID, {});

    expect(prismaMock.alert.create.mock.calls[0][0].data.message).toMatch(/^A vacina Raiva de Rex está atrasada desde/);
  });

  it("não cria alerta se já existe uma dose mais recente da mesma vacina", async () => {
    prismaMock.vaccine.findMany.mockResolvedValue([vaccine({ nextDoseAt: daysFromNow(-10) })]);
    prismaMock.vaccine.findFirst.mockResolvedValue(vaccine({ id: "vac-2", appliedAt: daysFromNow(-2) }));
    prismaMock.alert.findMany.mockResolvedValue([]);

    await getAlertsByTutor(TUTOR_ID, {});

    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });

  it("filtro por pet de outro tutor é bloqueado", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet({ tutorId: OTHER_TUTOR_ID }));

    await expect(getAlertsByTutor(TUTOR_ID, { petId: PET_ID })).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.alert.findMany).not.toHaveBeenCalled();
  });
});

describe("marcar alertas como lidos", () => {
  it("alerta de outro tutor devolve 403", async () => {
    prismaMock.alert.findUnique.mockResolvedValue({ id: "a1", pet: { tutorId: OTHER_TUTOR_ID } });

    await expect(markAlertAsRead("a1", TUTOR_ID)).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.alert.update).not.toHaveBeenCalled();
  });

  it("alerta inexistente devolve 404", async () => {
    prismaMock.alert.findUnique.mockResolvedValue(null);

    await expect(markAlertAsRead("a1", TUTOR_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("marcar todos atualiza só os não lidos do tutor e informa a quantidade", async () => {
    prismaMock.alert.updateMany.mockResolvedValue({ count: 3 });

    await expect(markAllAlertsAsRead(TUTOR_ID, {})).resolves.toEqual({ updated: 3 });
    expect(prismaMock.alert.updateMany).toHaveBeenCalledWith({
      where: { read: false, pet: { tutorId: TUTOR_ID } },
      data: { read: true },
    });
  });
});
