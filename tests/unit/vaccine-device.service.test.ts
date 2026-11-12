import { describe, expect, it } from "vitest";
import { prismaMock } from "../prismaMock";
import { createVaccine, updateVaccine } from "../../src/services/vaccine.service";
import { createDevice, createStation } from "../../src/services/device.service";
import { daysFromNow, OTHER_TUTOR_ID, pet, PET_ID, TUTOR_ID } from "../helpers";

describe("vaccine.service", () => {
  it("próxima dose precisa ser depois da aplicação", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());

    await expect(
      createVaccine(PET_ID, TUTOR_ID, { name: "V10", appliedAt: daysFromNow(-1), nextDoseAt: daysFromNow(-2) }),
    ).rejects.toMatchObject({ statusCode: 400, message: "A próxima dose deve ser depois da data de aplicação" });
    expect(prismaMock.vaccine.create).not.toHaveBeenCalled();
  });

  it("não deixa cadastrar vacina em pet de outro tutor", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet({ tutorId: OTHER_TUTOR_ID }));

    await expect(createVaccine(PET_ID, TUTOR_ID, { name: "V10", appliedAt: daysFromNow(-1) })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("mudar a data da próxima dose apaga o alerta antigo da vacina", async () => {
    prismaMock.vaccine.findUnique.mockResolvedValue({
      id: "vac-1",
      petId: PET_ID,
      appliedAt: daysFromNow(-30),
      nextDoseAt: daysFromNow(2),
    });
    prismaMock.pet.findUnique.mockResolvedValue(pet());

    await updateVaccine("vac-1", TUTOR_ID, { nextDoseAt: daysFromNow(300) });

    expect(prismaMock.alert.deleteMany).toHaveBeenCalledWith({ where: { vaccineId: "vac-1", type: "VACCINE_DUE" } });
    expect(prismaMock.vaccine.update).toHaveBeenCalled();
  });
});

describe("device.service", () => {
  const data = { type: "COLLAR" as const, deviceCode: "ESP32-AB12" };

  it("vincula dispositivo novo ao pet", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.device.findUnique.mockResolvedValue(null);
    prismaMock.device.create.mockResolvedValue({ id: "d1", ...data, petId: PET_ID });

    await expect(createDevice(PET_ID, TUTOR_ID, data)).resolves.toMatchObject({ id: "d1" });
    expect(prismaMock.device.create).toHaveBeenCalledWith({ data: { ...data, petId: PET_ID } });
  });

  it("vincula dispositivo simulado repassando o source", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.device.findUnique.mockResolvedValue(null);
    prismaMock.device.create.mockResolvedValue({ id: "d2" });
    const simulated = { ...data, source: "SIMULATED" as const };

    await createDevice(PET_ID, TUTOR_ID, simulated);

    expect(prismaMock.device.create).toHaveBeenCalledWith({ data: { ...simulated, petId: PET_ID } });
  });

  it.each([
    [PET_ID, "Este dispositivo já está vinculado a este pet"],
    ["outro-pet", "Este dispositivo já está vinculado a outro pet. Desvincule-o antes de usar aqui"],
  ])("código já em uso (pet %s) devolve 409", async (ownerPetId, message) => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.device.findUnique.mockResolvedValue({ id: "d0", petId: ownerPetId });

    await expect(createDevice(PET_ID, TUTOR_ID, data)).rejects.toMatchObject({ statusCode: 409, message });
    expect(prismaMock.device.create).not.toHaveBeenCalled();
  });

  it.each([
    ["COLLAR", "Este pet já tem uma coleira vinculada. Remova a atual antes de adicionar outra"],
    ["FOOD_BOWL", "Este pet já tem um pote de comida vinculado. Remova o atual antes de adicionar outro"],
    ["WATER_BOWL", "Este pet já tem um pote de água vinculado. Remova o atual antes de adicionar outro"],
  ] as const)("pet que já tem %s não aceita outro do mesmo tipo (409)", async (type, message) => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.device.findUnique.mockResolvedValue(null);
    prismaMock.device.findFirst.mockResolvedValue({ id: "d0", petId: PET_ID, type });

    await expect(createDevice(PET_ID, TUTOR_ID, { type, deviceCode: "NOVO-01" })).rejects.toMatchObject({
      statusCode: 409,
      message,
    });
    expect(prismaMock.device.findFirst).toHaveBeenCalledWith({ where: { petId: PET_ID, type } });
    expect(prismaMock.device.create).not.toHaveBeenCalled();
  });

  it("corrida: duas requisições juntas, o índice único do banco barra a segunda (409)", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.device.findUnique.mockResolvedValue(null);
    // 1ª checagem: livre. Depois do erro P2002 do banco: o outro dispositivo já aparece.
    prismaMock.device.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "d0", petId: PET_ID, type: "COLLAR" });
    prismaMock.device.create.mockRejectedValue({ code: "P2002" });

    await expect(createDevice(PET_ID, TUTOR_ID, data)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("device.service — estação de potes", () => {
  const STATION = "ESTACAO-1A2B3C";

  const setupOk = () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet());
    prismaMock.device.findMany.mockResolvedValue([]);
    prismaMock.device.findFirst.mockResolvedValue(null);
    prismaMock.device.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "d", ...data }));
    prismaMock.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  };

  it("vincula pote de comida e pote de água de uma vez, com códigos derivados do ID", async () => {
    setupOk();

    const result = await createStation(PET_ID, TUTOR_ID, STATION);

    expect(result.stationCode).toBe(STATION);
    expect(prismaMock.device.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.device.create).toHaveBeenCalledWith({
      data: { type: "FOOD_BOWL", deviceCode: "COMIDA-1A2B3C", petId: PET_ID, source: "REAL" },
    });
    expect(prismaMock.device.create).toHaveBeenCalledWith({
      data: { type: "WATER_BOWL", deviceCode: "AGUA-1A2B3C", petId: PET_ID, source: "REAL" },
    });
    expect(result.devices).toHaveLength(2);
  });

  it("estação simulada grava os dois potes com source SIMULATED", async () => {
    setupOk();

    await createStation(PET_ID, TUTOR_ID, "ESTACAO-SIM4F9K", "SIMULATED");

    expect(prismaMock.device.create).toHaveBeenCalledWith({
      data: { type: "FOOD_BOWL", deviceCode: "COMIDA-SIM4F9K", petId: PET_ID, source: "SIMULATED" },
    });
    expect(prismaMock.device.create).toHaveBeenCalledWith({
      data: { type: "WATER_BOWL", deviceCode: "AGUA-SIM4F9K", petId: PET_ID, source: "SIMULATED" },
    });
  });

  it("estação já vinculada a outro pet dá 409 e não cria nada", async () => {
    setupOk();
    prismaMock.device.findMany.mockResolvedValue([{ id: "x", petId: "outro-pet", deviceCode: "COMIDA-1A2B3C" }]);

    await expect(createStation(PET_ID, TUTOR_ID, STATION)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.device.create).not.toHaveBeenCalled();
  });

  it("pet que já tem pote de comida ou de água não aceita a estação (409)", async () => {
    setupOk();
    prismaMock.device.findFirst.mockResolvedValue({ id: "y", petId: PET_ID, type: "WATER_BOWL" });

    await expect(createStation(PET_ID, TUTOR_ID, STATION)).rejects.toMatchObject({
      statusCode: 409,
      message: "Este pet já tem um pote de água vinculado. Remova o atual antes de adicionar outro",
    });
    expect(prismaMock.device.create).not.toHaveBeenCalled();
  });

  it("pet de outro tutor dá 403", async () => {
    prismaMock.pet.findUnique.mockResolvedValue(pet({ tutorId: OTHER_TUTOR_ID }));

    await expect(createStation(PET_ID, TUTOR_ID, STATION)).rejects.toMatchObject({ statusCode: 403 });
  });
});