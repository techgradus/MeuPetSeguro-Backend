import { prisma } from "../config/prisma";
import {
  CreateVaccineInput,
  UpdateVaccineInput,
} from "../validators/vaccine.validator";
import { VaccineNotFoundError } from "../errors";
import { findPetOrThrow } from "./pet.service";


export const createVaccine = async (
  petId: string,
  tutorId: string,
  data: CreateVaccineInput
) => {
  await findPetOrThrow(petId, tutorId);


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
  await getVaccineById(vaccineId, tutorId);


  return prisma.vaccine.update({
    where: { id: vaccineId },
    data,
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