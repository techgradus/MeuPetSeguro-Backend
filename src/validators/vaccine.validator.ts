import { z } from "zod";


export const createVaccineSchema = z.object({
  name: z.string().min(1, "Nome da vacina é obrigatório"),
  appliedAt: z.coerce.date(),
  nextDoseAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});


export const updateVaccineSchema = createVaccineSchema.partial();


export type CreateVaccineInput = z.infer<typeof createVaccineSchema>;
export type UpdateVaccineInput = z.infer<typeof updateVaccineSchema>;