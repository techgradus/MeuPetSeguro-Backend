import { Request, Response, NextFunction } from "express";
import { registerSchema, loginSchema, changePasswordSchema, updateProfileSchema } from "../validators/auth.validator";
import { registerUser, loginUser, getCurrentUser, changeUserPassword, updateUserProfile } from "../services/auth.service";
import { forgotPasswordSchema, resetPasswordSchema } from "../validators/auth.validator";
import { requestPasswordReset, resetUserPassword } from "../services/password-reset.service";

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

export const updateMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const user = await updateUserProfile(req.userId!, data);
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

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    await requestPasswordReset(email);
    return res.status(200).json({
      message: "Se o e-mail estiver cadastrado, você receberá um código em instantes",
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, code, newPassword } = resetPasswordSchema.parse(req.body);
    await resetUserPassword(email, code, newPassword);
    return res.status(200).json({ message: "Senha redefinida com sucesso" });
  } catch (error) {
    next(error);
  }
};