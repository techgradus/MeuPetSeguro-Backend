import { randomInt } from "crypto";
import { prisma } from "../config/prisma";
import { hashPassword, comparePassword } from "../utils/password";
import { sendPasswordResetCode } from "./mail.service";
import { InvalidResetCodeError } from "../errors";

const CODE_EXPIRES_IN_MS = 15 * 60 * 1000; // 15 minutos
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minuto entre pedidos
const MAX_ATTEMPTS = 5;

// randomInt é criptograficamente seguro; Math.random não é
const generateResetCode = () =>
  randomInt(0, 1_000_000).toString().padStart(6, "0");

export const requestPasswordReset = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) return;

  const lastReset = await prisma.passwordReset.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (lastReset && Date.now() - lastReset.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return;
  }

  const code = generateResetCode();
  const codeHash = await hashPassword(code);

  // só o código mais recente vale
  await prisma.passwordReset.deleteMany({ where: { userId: user.id } });

  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      codeHash,
      expiresAt: new Date(Date.now() + CODE_EXPIRES_IN_MS),
    },
  });

  // sem await: a resposta não fica presa esperando o provedor de e-mail,
  // que é lento e pode falhar. O erro, se houver, aparece no log.
  sendPasswordResetCode(user.email, user.name, code).catch((error) => {
    console.error("Falha ao enviar e-mail de redefinição:", error);
  });
};

export const resetUserPassword = async (
  email: string,
  code: string,
  newPassword: string
) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new InvalidResetCodeError();
  }

  const reset = await prisma.passwordReset.findFirst({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!reset || reset.attempts >= MAX_ATTEMPTS) {
    throw new InvalidResetCodeError();
  }

  const isCodeValid = await comparePassword(code, reset.codeHash);

  if (!isCodeValid) {
    await prisma.passwordReset.update({
      where: { id: reset.id },
      data: { attempts: { increment: 1 } },
    });
    throw new InvalidResetCodeError();
  }

  const hashedPassword = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    }),
    prisma.passwordReset.deleteMany({ where: { userId: user.id } }),
  ]);
};