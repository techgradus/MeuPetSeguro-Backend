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
