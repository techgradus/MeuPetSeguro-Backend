import { Request, Response, NextFunction } from "express";
import { createDeviceSchema } from "../validators/device.validator";
import { createDevice, getDevicesByPet, getDeviceById, deleteDevice } from "../services/device.service";

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createDeviceSchema.parse(req.body);
    const device = await createDevice(req.params.petId, req.userId!, data);
    return res.status(201).json(device);
  } catch (error) {
    next(error);
  }
};

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const devices = await getDevicesByPet(req.params.petId, req.userId!);
    return res.status(200).json(devices);
  } catch (error) {
    next(error);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await getDeviceById(req.params.id, req.params.petId, req.userId!);
    return res.status(200).json(device);
  } catch (error) {
    next(error);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteDevice(req.params.id, req.params.petId, req.userId!);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};
