import { z } from "zod";
import { ActivityLevel, DeviceStatus } from "@prisma/client";

export const telemetrySchema = z.object({
  activityLevel: z.enum(ActivityLevel).optional(),
  intensity: z.number().min(0).max(1).optional(),
  weightGrams: z.number().min(0).optional(),
  recordedAt: z.string().datetime().optional(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
});

export type TelemetryInput = z.infer<typeof telemetrySchema>;

export const statusSchema = z.object({
  status: z.enum(DeviceStatus),
  batteryLevel: z.number().int().min(0).max(100).optional(),
});

export type StatusInput = z.infer<typeof statusSchema>;
