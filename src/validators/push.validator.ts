import { z } from "zod";

export const registerPushTokenSchema = z.object({
  token: z.string().min(20, "Token inválido").max(4096, "Token inválido"),
  platform: z.enum(["android", "ios"]),
});

export const removePushTokenSchema = z.object({
  token: z.string().min(1, "Token obrigatório"),
});

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;
