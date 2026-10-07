import { z } from "zod";

export const createPetSchema = z.object({
  name: z.string().min(1, "Nome do pet é obrigatório"),
  species: z.string().min(1, "Espécie é obrigatória"),
  breed: z.string().optional(),
  birthDate: z.coerce.date().optional(),
  weightKg: z.coerce.number().positive("Peso deve ser maior que zero").optional(),
  notes: z.string().optional(),
});

export const updatePetSchema = createPetSchema.partial();

export type CreatePetInput = z.infer<typeof createPetSchema>;
export type UpdatePetInput = z.infer<typeof updatePetSchema>;