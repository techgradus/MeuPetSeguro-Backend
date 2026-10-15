import { AppError } from "./AppError";

export class AlertNotFoundError extends AppError {
  constructor() {
    super("Alerta não encontrado", 404);
  }
}

export class AlertAccessDeniedError extends AppError {
  constructor() {
    super("Você não tem permissão para acessar este alerta", 403);
  }
}
