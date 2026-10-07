import { prisma } from "../config/prisma";
import { CreatePetInput, UpdatePetInput } from "../validators/pet.validator";
import { PetNotFoundError, PetAccessDeniedError } from "../errors";

const buildPhotoUrl = (filename?: string): string | undefined => {
  if (!filename) return undefined;
  return `/uploads/pets/${filename}`;
};

export const createPet = async (
  tutorId: string,
  data: CreatePetInput,
  photoFilename?: string
) => {
  return prisma.pet.create({
    data: {
      ...data,
      tutorId,
      photoUrl: buildPhotoUrl(photoFilename),
    },
  });
};

export const getPetsByTutor = async (tutorId: string) => {
  return prisma.pet.findMany({
    where: { tutorId },
    orderBy: { createdAt: "desc" },
  });
};

const findPetOrThrow = async (petId: string, tutorId: string) => {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });

  if (!pet) {
    throw new PetNotFoundError();
  }

  if (pet.tutorId !== tutorId) {
    throw new PetAccessDeniedError();
  }

  return pet;
};

export const getPetById = async (petId: string, tutorId: string) => {
  return findPetOrThrow(petId, tutorId);
};

export const updatePet = async (
  petId: string,
  tutorId: string,
  data: UpdatePetInput,
  photoFilename?: string
) => {
  await findPetOrThrow(petId, tutorId);

  return prisma.pet.update({
    where: { id: petId },
    data: {
      ...data,
      ...(photoFilename ? { photoUrl: buildPhotoUrl(photoFilename) } : {}),
    },
  });
};

export const deletePet = async (petId: string, tutorId: string) => {
  await findPetOrThrow(petId, tutorId);
  return prisma.pet.delete({ where: { id: petId } });
};