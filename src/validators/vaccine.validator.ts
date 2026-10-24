import { z } from "zod";

const vaccineBaseSchema = z.object({
  name: z.string().trim().min(1, "Nome da vacina é obrigatório"),
  appliedAt: z.coerce.date().refine((d) => d <= new Date(), {
    message: "A data de aplicação não pode ser no futuro",
  }),
  nextDoseAt: z.coerce.date().nullable().optional(),
  notes: z.string().optional(),
});

export const createVaccineSchema = vaccineBaseSchema;
export const updateVaccineSchema = vaccineBaseSchema.partial();

export type CreateVaccineInput = z.infer<typeof createVaccineSchema>;
export type UpdateVaccineInput = z.infer<typeof updateVaccineSchema>;