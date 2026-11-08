import { prisma } from "../config/prisma";
import { CreateDeviceInput } from "../validators/device.validator";
import { DeviceNotFoundError, DeviceAlreadyLinkedError, DeviceTypeAlreadyLinkedError } from "../errors";
import { findPetOrThrow } from "./pet.service";

const assertCanLink = async (petId: string, data: CreateDeviceInput) => {
  const sameCode = await prisma.device.findUnique({ where: { deviceCode: data.deviceCode } });

  if (sameCode) {
    throw new DeviceAlreadyLinkedError(sameCode.petId === petId);
  }

  const sameType = await prisma.device.findFirst({ where: { petId, type: data.type } });

  if (sameType) {
    throw new DeviceTypeAlreadyLinkedError(data.type);
  }
};

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

export const createDevice = async (petId: string, tutorId: string, data: CreateDeviceInput) => {
  await findPetOrThrow(petId, tutorId);
  await assertCanLink(petId, data);

  try {
    return await prisma.device.create({
      data: { ...data, petId },
    });
  } catch (error) {
    // Duas requisições simultâneas passam pela checagem acima;
    if (isUniqueViolation(error)) {
      await assertCanLink(petId, data);
    }
    throw error;
  }
};

export const getDevicesByPet = async (petId: string, tutorId: string) => {
  await findPetOrThrow(petId, tutorId);

  return prisma.device.findMany({
    where: { petId },
    orderBy: { createdAt: "desc" },
  });
};

const findDeviceOrThrow = async (deviceId: string, petId: string, tutorId: string) => {
  await findPetOrThrow(petId, tutorId);

  const device = await prisma.device.findFirst({ where: { id: deviceId, petId } });

  if (!device) {
    throw new DeviceNotFoundError();
  }

  return device;
};

export const getDeviceById = async (deviceId: string, petId: string, tutorId: string) => {
  return findDeviceOrThrow(deviceId, petId, tutorId);
};

export const deleteDevice = async (deviceId: string, petId: string, tutorId: string) => {
  await findDeviceOrThrow(deviceId, petId, tutorId);
  return prisma.device.delete({ where: { id: deviceId } });
};
