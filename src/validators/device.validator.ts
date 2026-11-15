import { z } from "zod";
import { DeviceSource, DeviceType } from "@prisma/client";

export const createDeviceSchema = z.object({
  type: z.enum(DeviceType, "Tipo de dispositivo inválido (use COLLAR, FOOD_BOWL ou WATER_BOWL)"),
  deviceCode: z
    .string()
    .trim()
    .min(1, "Código do dispositivo é obrigatório")
    .transform((code) => code.toUpperCase()),
  source: z.enum(DeviceSource, "Origem inválida (use REAL ou SIMULATED)").optional(),
});

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

export const STATION_PREFIX = "ESTACAO-";

export const createStationSchema = z.object({
  stationCode: z
    .string()
    .trim()
    .transform((code) => code.toUpperCase())
    .pipe(z.string().regex(/^ESTACAO-[A-Z0-9]{4,12}$/, "Código da estação inválido. Exemplo: ESTACAO-1A2B3C")),
  source: z.enum(DeviceSource, "Origem inválida (use REAL ou SIMULATED)").optional(),
});

export type CreateStationInput = z.infer<typeof createStationSchema>;