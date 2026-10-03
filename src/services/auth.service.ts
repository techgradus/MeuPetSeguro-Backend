import { prisma } from "../config/prisma";
import { hashPassword } from "../utils/password";
import { RegisterInput } from "../validators/auth.validator";
import { comparePassword } from "../utils/password";
import { generateToken } from "../utils/jwt";
import { LoginInput } from "../validators/auth.validator";

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("E-mail já cadastrado");
    this.name = "EmailAlreadyInUseError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("E-mail ou senha incorretos");
    this.name = "InvalidCredentialsError";
  }
}

export const registerUser = async (data: RegisterInput) => {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new EmailAlreadyInUseError();
  }

  const hashedPassword = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: hashedPassword,
    },
  });

  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

export const loginUser = async (data: LoginInput) => {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user) {
    throw new InvalidCredentialsError();
  }

  const isPasswordValid = await comparePassword(data.password, user.password);

  if (!isPasswordValid) {
    throw new InvalidCredentialsError();
  }

  const token = generateToken({ userId: user.id });

  const { password, ...userWithoutPassword } = user;
  return { user: userWithoutPassword, token };
};