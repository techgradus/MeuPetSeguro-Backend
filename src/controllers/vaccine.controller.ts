import { Request, Response, NextFunction } from "express";
import {
  createVaccineSchema,
  updateVaccineSchema,
} from "../validators/vaccine.validator";
import {
  createVaccine,
  getVaccinesByPet,
  getVaccineById,
  updateVaccine,
  deleteVaccine,
} from "../services/vaccine.service";


export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = createVaccineSchema.parse(req.body);
    const vaccine = await createVaccine(
      req.params.petId,
      req.userId!,
      data
    );
    return res.status(201).json(vaccine);
  } catch (error) {
    next(error);
  }
};


export const list = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const vaccines = await getVaccinesByPet(
      req.params.petId,
      req.userId!
    );
    return res.status(200).json(vaccines);
  } catch (error) {
    next(error);
  }
};


export const getById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const vaccine = await getVaccineById(
      req.params.id,
      req.userId!
    );
    return res.status(200).json(vaccine);
  } catch (error) {
    next(error);
  }
};


export const update = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = updateVaccineSchema.parse(req.body);
    const vaccine = await updateVaccine(
      req.params.id,
      req.userId!,
      data
    );
    return res.status(200).json(vaccine);
  } catch (error) {
    next(error);
  }
};


export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await deleteVaccine(req.params.id, req.userId!);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};