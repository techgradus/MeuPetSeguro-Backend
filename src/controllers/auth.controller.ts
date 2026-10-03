import { Request, Response } from "express";
import { ZodError } from "zod";
import { registerSchema } from "../validators/auth.validator";
import { registerUser, EmailAlreadyInUseError } from "../services/auth.service";

export const register = async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    const user = await registerUser(data);
    return res.status(201).json(user);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error instanceof EmailAlreadyInUseError) {
      return res.status(409).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Erro ao criar conta" });
  }
};