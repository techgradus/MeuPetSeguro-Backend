import { prisma } from "../config/prisma";
import { hashPassword } from "../utils/password";
import { ChangePasswordInput, RegisterInput, UpdateProfileInput } from "../validators/auth.validator";
import { comparePassword } from "../utils/password";
import { generateToken } from "../utils/jwt";
import { LoginInput } from "../validators/auth.validator";
import { EmailAlreadyInUseError, InvalidCredentialsError , InvalidTokenError, IncorrectCurrentPasswordError} from "../errors";

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
      phone: data.phone,
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

export const getCurrentUser = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new InvalidTokenError();
  }

  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

export const updateUserProfile = async (userId: string, data: UpdateProfileInput) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new InvalidTokenError();
  }

  if (data.email && data.email !== user.email) {
    const emailInUse = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (emailInUse) {
      throw new EmailAlreadyInUseError();
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone === undefined ? undefined : data.phone || null,
    },
  });

  const { password, ...userWithoutPassword } = updatedUser;
  return userWithoutPassword;
};

export const changeUserPassword = async (
  userId: string,
  data: ChangePasswordInput
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new InvalidTokenError();
  }

  const isCurrentPasswordValid = await comparePassword(
    data.currentPassword,
    user.password
  );

  if (!isCurrentPasswordValid) {
    throw new IncorrectCurrentPasswordError();
  }

  const hashedPassword = await hashPassword(data.newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });
};