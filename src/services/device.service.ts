import { prisma } from "../config/prisma";
import { CreateDeviceInput } from "../validators/device.validator";
import { DeviceNotFoundError, DeviceAlreadyLinkedError } from "../errors";
import { findPetOrThrow } from "./pet.service";

export const createDevice = async (petId: string, tutorId: string, data: CreateDeviceInput) => {
  await findPetOrThrow(petId, tutorId);

  const existing = await prisma.device.findUnique({ where: { deviceCode: data.deviceCode } });

  if (existing) {
    throw new DeviceAlreadyLinkedError(existing.petId === petId);
  }

  return prisma.device.create({
    data: { ...data, petId },
  });
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
