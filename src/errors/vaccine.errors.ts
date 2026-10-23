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
