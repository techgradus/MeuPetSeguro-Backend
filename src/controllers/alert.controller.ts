import { Request, Response, NextFunction } from "express";
import { listAlertsQuerySchema } from "../validators/alert.validator";
import { getAlertsByTutor, markAlertAsRead, markAllAlertsAsRead } from "../services/alert.service";

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listAlertsQuerySchema.parse(req.query);
    const alerts = await getAlertsByTutor(req.userId!, query);
    return res.status(200).json(alerts);
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await markAlertAsRead(req.params.id, req.userId!);
    return res.status(200).json(alert);
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listAlertsQuerySchema.parse(req.query);
    const result = await markAllAlertsAsRead(req.userId!, query);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
