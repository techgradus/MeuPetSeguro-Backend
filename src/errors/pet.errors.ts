import { AppError } from "./AppError";

export class PetNotFoundError extends AppError {
  constructor() {
    super("Pet não encontrado", 404);
  }
}

export class PetAccessDeniedError extends AppError {
  constructor() {
    super("Você não tem permissão para acessar este pet", 403);
  }
}