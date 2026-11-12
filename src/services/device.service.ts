import { prisma } from "../config/prisma";
import { CreateDeviceInput, STATION_PREFIX } from "../validators/device.validator";
import { DeviceNotFoundError, DeviceAlreadyLinkedError, DeviceTypeAlreadyLinkedError } from "../errors";
import { findPetOrThrow } from "./pet.service";
import { DeviceSource, DeviceType } from "@prisma/client";

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
    // Duas requisições simultâneas passam pela checagem acima; o índice único do banco
    // (petId + type) barra a segunda e aqui ela vira o mesmo 409 de sempre.
    if (isUniqueViolation(error)) {
      await assertCanLink(petId, data);
    }
    throw error;
  }
};

// Os dois códigos saem do ID da estação: ESTACAO-1A2B3C -> COMIDA-1A2B3C e AGUA-1A2B3C.
const stationCodes = (stationCode: string) => {
  const id = stationCode.slice(STATION_PREFIX.length);
  return { foodCode: `COMIDA-${id}`, waterCode: `AGUA-${id}` };
};

const assertStationCanLink = async (petId: string, foodCode: string, waterCode: string) => {
  const inUse = await prisma.device.findMany({ where: { deviceCode: { in: [foodCode, waterCode] } } });

  if (inUse.length > 0) {
    throw new DeviceAlreadyLinkedError(inUse.every((device) => device.petId === petId));
  }

  const bowl = await prisma.device.findFirst({
    where: { petId, type: { in: [DeviceType.FOOD_BOWL, DeviceType.WATER_BOWL] } },
  });

  if (bowl) {
    throw new DeviceTypeAlreadyLinkedError(bowl.type);
  }
};

export const createStation = async (
  petId: string,
  tutorId: string,
  stationCode: string,
  source: DeviceSource = DeviceSource.REAL
) => {
  await findPetOrThrow(petId, tutorId);

  const { foodCode, waterCode } = stationCodes(stationCode);
  await assertStationCanLink(petId, foodCode, waterCode);

  try {
    const devices = await prisma.$transaction([
      prisma.device.create({ data: { type: DeviceType.FOOD_BOWL, deviceCode: foodCode, petId, source } }),
      prisma.device.create({ data: { type: DeviceType.WATER_BOWL, deviceCode: waterCode, petId, source } }),
    ]);

    return { stationCode, devices };
  } catch (error) {
    // Corrida entre duas requisições: o índice único do banco barra a segunda
    if (isUniqueViolation(error)) {
      await assertStationCanLink(petId, foodCode, waterCode);
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
