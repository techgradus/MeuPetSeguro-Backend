import { AlertType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ListAlertsQuery } from "../validators/alert.validator";
import { AlertNotFoundError, AlertAccessDeniedError } from "../errors";
import { findPetOrThrow } from "./pet.service";

// Quantos dias antes da próxima dose a vacina já conta como "vencendo"
const VACCINE_DUE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const formatDate = (date: Date) =>
  date.toLocaleDateString("pt-BR", { timeZone: "UTC" });

const buildVaccineMessage = (petName: string, vaccineName: string, nextDoseAt: Date) => {
  const daysLeft = Math.ceil((nextDoseAt.getTime() - Date.now()) / DAY_MS);

  if (daysLeft < 0) {
    return `A vacina ${vaccineName} de ${petName} está atrasada desde ${formatDate(nextDoseAt)}`;
  }
  if (daysLeft === 0) {
    return `A vacina ${vaccineName} de ${petName} vence hoje`;
  }
  return `A vacina ${vaccineName} de ${petName} vence em ${daysLeft} dia(s), em ${formatDate(nextDoseAt)}`;
};

// Checagem sob demanda: roda sempre que o tutor lista os alertas.
// Cria no máximo um alerta por vacina (mesmo depois de lido), para não repetir o aviso.
const generateVaccineAlerts = async (tutorId: string, petId?: string) => {
  const limit = new Date(Date.now() + VACCINE_DUE_DAYS * DAY_MS);

  const dueVaccines = await prisma.vaccine.findMany({
    where: {
      nextDoseAt: { lte: limit },
      alerts: { none: { type: AlertType.VACCINE_DUE } },
      pet: { tutorId, ...(petId ? { id: petId } : {}) },
    },
    include: { pet: { select: { name: true } } },
  });

  for (const vaccine of dueVaccines) {
    // Se já existe uma dose mais recente da mesma vacina, essa já foi resolvida
    const newerDose = await prisma.vaccine.findFirst({
      where: {
        petId: vaccine.petId,
        name: { equals: vaccine.name, mode: "insensitive" },
        appliedAt: { gt: vaccine.appliedAt },
      },
    });

    if (newerDose) continue;

    await prisma.alert.create({
      data: {
        type: AlertType.VACCINE_DUE,
        message: buildVaccineMessage(vaccine.pet.name, vaccine.name, vaccine.nextDoseAt!),
        petId: vaccine.petId,
        vaccineId: vaccine.id,
      },
    });
  }
};

export const getAlertsByTutor = async (tutorId: string, query: ListAlertsQuery) => {
  if (query.petId) {
    await findPetOrThrow(query.petId, tutorId);
  }

  await generateVaccineAlerts(tutorId, query.petId);

  return prisma.alert.findMany({
    where: { pet: { tutorId }, ...(query.petId ? { petId: query.petId } : {}) },
    include: { pet: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
};

const findAlertOrThrow = async (alertId: string, tutorId: string) => {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { pet: { select: { tutorId: true } } },
  });

  if (!alert) {
    throw new AlertNotFoundError();
  }

  if (alert.pet.tutorId !== tutorId) {
    throw new AlertAccessDeniedError();
  }

  return alert;
};

export const markAlertAsRead = async (alertId: string, tutorId: string) => {
  await findAlertOrThrow(alertId, tutorId);

  return prisma.alert.update({
    where: { id: alertId },
    data: { read: true },
  });
};

export const markAllAlertsAsRead = async (tutorId: string, query: ListAlertsQuery) => {
  if (query.petId) {
    await findPetOrThrow(query.petId, tutorId);
  }

  const result = await prisma.alert.updateMany({
    where: { read: false, pet: { tutorId }, ...(query.petId ? { petId: query.petId } : {}) },
    data: { read: true },
  });

  return { updated: result.count };
};
