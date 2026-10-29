import { AppError } from "./AppError";

export class AiUnavailableError extends AppError {
  constructor() {
    super("Serviço de IA indisponível no momento", 503);
  }
}

export class AiMissingDevicesError extends AppError {
  constructor() {
    super("O pet precisa de coleira, pote de comida e pote de água cadastrados para a análise da IA", 422);
  }
}

export class AiNoReadingsError extends AppError {
  constructor() {
    super("Ainda não há leituras dos dispositivos deste pet para analisar", 422);
  }
}
