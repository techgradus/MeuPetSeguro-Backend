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

export class InvalidTokenError extends AppError {
  constructor() {
    super("Token inválido ou expirado", 401);
  }
}

export class IncorrectCurrentPasswordError extends AppError {
  constructor() {
    super("Senha atual incorreta", 400);
  }
}

export class InvalidResetCodeError extends AppError {
  constructor() {
    super("Código inválido ou expirado", 400);
  }
}

export class PhotoRequiredError extends AppError {
  constructor() {
    super('Envie uma imagem no campo "photo"', 400);
  }
}