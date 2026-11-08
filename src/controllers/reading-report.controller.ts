import { Request, Response, NextFunction } from "express";
import { activityQuerySchema, consumptionQuerySchema } from "../validators/reading-report.validator";
import { getLatestReadings, getActivityReport, getConsumptionReport } from "../services/reading-report.service";

export const latest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getLatestReadings(req.params.petId, req.userId!);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

export const activity = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { period } = activityQuerySchema.parse(req.query);
    const data = await getActivityReport(req.params.petId, req.userId!, period);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

export const consumption = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { kind } = consumptionQuerySchema.parse(req.query);
    const data = await getConsumptionReport(req.params.petId, req.userId!, kind);
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};