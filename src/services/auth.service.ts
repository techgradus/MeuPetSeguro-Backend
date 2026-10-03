import { prisma } from "../config/prisma";
import { hashPassword } from "../utils/password";
import { RegisterInput } from "../validators/auth.validator";

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("E-mail já cadastrado");
    this.name = "EmailAlreadyInUseError";
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