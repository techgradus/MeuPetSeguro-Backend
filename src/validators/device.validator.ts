import { z } from "zod";
import { DeviceType } from "@prisma/client";

export const createDeviceSchema = z.object({
  type: z.enum(DeviceType, "Tipo de dispositivo inválido (use COLLAR, FOOD_BOWL ou WATER_BOWL)"),
  deviceCode: z
    .string()
    .trim()
    .min(1, "Código do dispositivo é obrigatório")
    .transform((code) => code.toUpperCase()),
});

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
