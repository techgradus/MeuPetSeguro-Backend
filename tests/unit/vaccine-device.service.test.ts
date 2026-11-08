import { describe, expect, it } from "vitest";
import { prismaMock } from "../prismaMock";
import { createVaccine, updateVaccine } from "../../src/services/vaccine.service";
import { createDevice } from "../../src/services/device.service";
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