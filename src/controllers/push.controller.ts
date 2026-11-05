import { Request, Response, NextFunction } from "express";
import { registerPushTokenSchema, removePushTokenSchema } from "../validators/push.validator";
import { registerPushToken, removePushToken, sendPushToUser } from "../services/push.service";

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerPushTokenSchema.parse(req.body);
    await registerPushToken(req.userId!, data);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = removePushTokenSchema.parse(req.body);
    await removePushToken(req.userId!, token);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// Manda uma notificação de teste para os aparelhos do próprio usuário logado
export const test = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await sendPushToUser(req.userId!, {
      title: "Teste de notificação",
      body: "Se você está vendo isto, o push do Meu Pet Seguro está funcionando 🐾",
      data: { type: "TEST" },
    });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
