import { AppError } from "./AppError";

export class EmailAlreadyInUseError extends AppError {
  constructor() {
    super("E-mail já cadastrado", 409);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super("E-mail ou senha incorretos", 401);
  }
}