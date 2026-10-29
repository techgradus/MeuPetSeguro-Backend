import { vi } from "vitest";

// Substitui o Prisma nos testes: cada método vira um vi.fn() que o teste configura.
const model = () => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
});

export const prismaMock = {
  user: model(),
  pet: model(),
  device: model(),
  vaccine: model(),
  alert: model(),
  passwordReset: model(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
};
