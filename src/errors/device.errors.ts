import { DeviceType } from "@prisma/client";
import { AppError } from "./AppError";

export class DeviceNotFoundError extends AppError {
  constructor() {
    super("Dispositivo não encontrado", 404);
  }
}

export class DeviceAlreadyLinkedError extends AppError {
  constructor(samePet: boolean) {
    super(
      samePet
        ? "Este dispositivo já está vinculado a este pet"
        : "Este dispositivo já está vinculado a outro pet. Desvincule-o antes de usar aqui",
      409
    );
  }
}

const TYPE_ALREADY_LINKED: Record<DeviceType, string> = {
  COLLAR: "Este pet já tem uma coleira vinculada. Remova a atual antes de adicionar outra",
  FOOD_BOWL: "Este pet já tem um pote de comida vinculado. Remova o atual antes de adicionar outro",
  WATER_BOWL: "Este pet já tem um pote de água vinculado. Remova o atual antes de adicionar outro",
};

export class DeviceTypeAlreadyLinkedError extends AppError {
  constructor(type: DeviceType) {
    super(TYPE_ALREADY_LINKED[type], 409);
  }
}