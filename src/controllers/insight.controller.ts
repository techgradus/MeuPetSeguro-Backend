import { Request, Response, NextFunction } from "express";
import { getPetInsights } from "../services/ai.service";

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const insights = await getPetInsights(req.params.petId, req.userId!);
    return res.status(200).json(insights);
  } catch (error) {
    next(error);
  }
};
