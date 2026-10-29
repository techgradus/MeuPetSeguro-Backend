import { prisma } from "../config/prisma";
import { CreatePetInput, UpdatePetInput } from "../validators/pet.validator";
import { PetNotFoundError, PetAccessDeniedError } from "../errors";
import { uploadImage, deleteImage } from "./storage.service";

const petInclude = { devices: { orderBy: { createdAt: "asc" as const } } };

const buildPhotoUrl = (filename?: string): string | undefined => {
  if (!filename) return undefined;
  return `/uploads/pets/${filename}`;
};

export const createPet = async (
  tutorId: string,
  data: CreatePetInput,
  photo?: Express.Multer.File
) => {
  const photoUrl = photo ? await uploadImage("pets", photo) : undefined;

  return prisma.pet.create({
    data: {
      ...data,
      tutorId,
      ...(photoUrl ? { photoUrl } : {}),
    },
    include: petInclude,
  }).catch(async (error) => {
    await deleteImage(photoUrl);
    throw error;
  });
};

export const getPetsByTutor = async (tutorId: string) => {
  return prisma.pet.findMany({
    where: { tutorId },
    orderBy: { createdAt: "desc" },
    include: petInclude,
  });
};

export const findPetOrThrow = async (petId: string, tutorId: string) => {
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
  await findPetOrThrow(petId, tutorId);
  return prisma.pet.findUnique({ where: { id: petId }, include: petInclude });
};

export const updatePet = async (
  petId: string,
  tutorId: string,
  data: UpdatePetInput,
  photo?: Express.Multer.File
) => {
  const pet = await findPetOrThrow(petId, tutorId);
  const photoUrl = photo ? await uploadImage("pets", photo) : undefined;

  const updated = await prisma.pet
    .update({
      where: { id: petId },
      data: { ...data, ...(photoUrl ? { photoUrl } : {}) },
      include: petInclude,
    })
    .catch(async (error) => {
      await deleteImage(photoUrl);
      throw error;
    });

  if (photoUrl) await deleteImage(pet.photoUrl);
  return updated;
};

export const deletePet = async (petId: string, tutorId: string) => {
  const pet = await findPetOrThrow(petId, tutorId);
  await prisma.pet.delete({ where: { id: petId } });
  await deleteImage(pet.photoUrl);
};