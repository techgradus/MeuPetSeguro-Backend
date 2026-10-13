import { Request, Response, NextFunction } from "express";
import { registerSchema, loginSchema, changePasswordSchema } from "../validators/auth.validator";
import { registerUser, loginUser, getCurrentUser, changeUserPassword } from "../services/auth.service";

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const user = await registerUser(data);
    return res.status(201).json(user);
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await loginUser(data);
    return res.status(200).json(result);

  } catch (error) {
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getCurrentUser(req.userId!);
    return res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = changePasswordSchema.parse(req.body);
    await changeUserPassword(req.userId!, data);
    return res.status(200).json({ message: "Senha alterada com sucesso" });
  } catch (error) {
    next(error);
  }
};