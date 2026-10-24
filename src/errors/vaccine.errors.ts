import { AppError } from "./AppError";


export class VaccineNotFoundError extends AppError {
  constructor() {
    super("Vacina não encontrada", 404);
  }
}


export class VaccineAccessDeniedError extends AppError {
  constructor() {
    super("Você não tem permissão para acessar esta vacina", 403);
  }
}

export class InvalidVaccineDatesError extends AppError {
  constructor() {
    super("A próxima dose deve ser depois da data de aplicação", 400);
  }
}