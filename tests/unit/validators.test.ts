import { describe, expect, it } from "vitest";
import { registerSchema, changePasswordSchema, updateProfileSchema } from "../../src/validators/auth.validator";
import { createDeviceSchema } from "../../src/validators/device.validator";
import { createVaccineSchema } from "../../src/validators/vaccine.validator";
import { daysFromNow } from "../helpers";

const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0].message;

describe("registerSchema", () => {
  const valid = { name: "Ana", email: "ana@meupet.com", password: "senha123" };

  it("aceita cadastro válido e normaliza o telefone", () => {
    const parsed = registerSchema.parse({ ...valid, phone: "(11) 98765-4321" });
    expect(parsed.phone).toBe("11987654321");
  });

  it.each([
    [{ ...valid, email: "ana" }, "E-mail inválido"],
    [{ ...valid, password: "123" }, "Senha deve ter pelo menos 6 caracteres"],
    [{ ...valid, name: "A" }, "Nome deve ter pelo menos 2 caracteres"],
    [{ ...valid, phone: "1234" }, "Telefone inválido. Use DDD + número"],
  ])("rejeita %o", (input, message) => {
    expect(firstError(registerSchema.safeParse(input))).toBe(message);
  });
});

describe("changePasswordSchema", () => {
  it("não deixa repetir a senha atual", () => {
    const result = changePasswordSchema.safeParse({ currentPassword: "senha123", newPassword: "senha123" });
    expect(firstError(result)).toBe("A nova senha deve ser diferente da atual");
  });
});

describe("updateProfileSchema", () => {
  it('aceita "" e null para apagar o telefone', () => {
    expect(updateProfileSchema.parse({ phone: "" }).phone).toBe("");
    expect(updateProfileSchema.parse({ phone: null }).phone).toBeNull();
  });
});

describe("createDeviceSchema", () => {
  it("normaliza o código do dispositivo", () => {
    expect(createDeviceSchema.parse({ type: "FOOD_BOWL", deviceCode: "  esp32-ab12 " })).toEqual({
      type: "FOOD_BOWL",
      deviceCode: "ESP32-AB12",
    });
  });

  it("rejeita tipo desconhecido", () => {
    const result = createDeviceSchema.safeParse({ type: "TV", deviceCode: "x" });
    expect(firstError(result)).toMatch(/Tipo de dispositivo inválido/);
  });
});

describe("createVaccineSchema", () => {
  it("rejeita data de aplicação no futuro", () => {
    const result = createVaccineSchema.safeParse({ name: "V10", appliedAt: daysFromNow(2) });
    expect(firstError(result)).toBe("A data de aplicação não pode ser no futuro");
  });

  it("exige o nome da vacina", () => {
    const result = createVaccineSchema.safeParse({ name: "   ", appliedAt: daysFromNow(-1) });
    expect(firstError(result)).toBe("Nome da vacina é obrigatório");
  });
});
