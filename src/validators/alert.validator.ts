import { z } from "zod";

export const listAlertsQuerySchema = z.object({
  petId: z.uuid("petId inválido").optional(),
});

export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
