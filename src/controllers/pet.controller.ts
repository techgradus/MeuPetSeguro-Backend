import { Request, Response, NextFunction } from "express";
import { createPetSchema, updatePetSchema } from "../validators/pet.validator";
import { createPet, getPetsByTutor, getPetById, deletePet, updatePet} from "../services/pet.service";

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createPetSchema.parse(req.body);
    const pet = await createPet(req.userId!, data, req.file?.filename);
    return res.status(201).json(pet);
  } catch (error) {
    next(error);
  }
};

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pets = await getPetsByTutor(req.userId!);
    return res.status(200).json(pets);
  } catch (error) {
    next(error);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pet = await getPetById(req.params.id, req.userId!);
    return res.status(200).json(pet);
  } catch (error) {
    next(error);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updatePetSchema.parse(req.body);
    const pet = await updatePet(req.params.id, req.userId!, data, req.file?.filename);
    return res.status(200).json(pet);
  } catch (error) {
    next(error);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deletePet(req.params.id, req.userId!);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};