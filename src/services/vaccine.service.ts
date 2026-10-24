import { prisma } from "../config/prisma";
import {
  CreateVaccineInput,
  UpdateVaccineInput,
} from "../validators/vaccine.validator";
import { AlertType } from "@prisma/client";
import { VaccineNotFoundError, InvalidVaccineDatesError } from "../errors";
import { findPetOrThrow } from "./pet.service";

const assertDoseOrder = (appliedAt: Date, nextDoseAt?: Date | null) => {
  if (nextDoseAt && nextDoseAt <= appliedAt) {
    throw new InvalidVaccineDatesError();
  }
};

export const createVaccine = async (
  petId: string,
  tutorId: string,
  data: CreateVaccineInput
) => {
  await findPetOrThrow(petId, tutorId);
  assertDoseOrder(data.appliedAt, data.nextDoseAt);


  return prisma.vaccine.create({
    data: {
      ...data,
      petId,
    },
  });
};


export const getVaccinesByPet = async (
  petId: string,
  tutorId: string
) => {
  await findPetOrThrow(petId, tutorId);


  return prisma.vaccine.findMany({
    where: { petId },
    orderBy: { appliedAt: "desc" },
  });
};


export const getVaccineById = async (
  vaccineId: string,
  tutorId: string
) => {
  const vaccine = await prisma.vaccine.findUnique({
    where: { id: vaccineId },
    include: { pet: true },
  });


  if (!vaccine) {
    throw new VaccineNotFoundError();
  }


  await findPetOrThrow(vaccine.petId, tutorId);


  return vaccine;
};


export const updateVaccine = async (
  vaccineId: string,
  tutorId: string,
  data: UpdateVaccineInput
) => {
  const current = await getVaccineById(vaccineId, tutorId);

  // usa o valor novo ou, se o campo não veio, o que já estava salvo
  assertDoseOrder(
    data.appliedAt ?? current.appliedAt,
    data.nextDoseAt === undefined ? current.nextDoseAt : data.nextDoseAt
  );


  return prisma.$transaction(async (tx) => {
    if (data.nextDoseAt !== undefined || data.appliedAt !== undefined) {
      await tx.alert.deleteMany({
        where: { vaccineId, type: AlertType.VACCINE_DUE },
      });
    }
    return tx.vaccine.update({ where: { id: vaccineId }, data });
  });
};


export const deleteVaccine = async (
  vaccineId: string,
  tutorId: string
) => {
  await getVaccineById(vaccineId, tutorId);


  return prisma.vaccine.delete({
    where: { id: vaccineId },
  });
};