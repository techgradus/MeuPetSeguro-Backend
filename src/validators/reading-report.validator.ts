import { z } from "zod";

export const activityQuerySchema = z.object({
  period: z.enum(["today", "week"], { error: "Período inválido. Use today ou week" }).default("today"),
});

export const consumptionQuerySchema = z.object({
  kind: z.enum(["food", "water"], { error: "Tipo inválido. Use food ou water" }),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type ConsumptionQuery = z.infer<typeof consumptionQuerySchema>;