import { beforeEach, vi } from "vitest";
import { prismaMock } from "./prismaMock";

vi.mock("../src/config/prisma", () => ({ prisma: prismaMock }));

vi.mock("../src/config/supabase", () => ({
  supabase: { storage: { from: vi.fn() } },
}));

beforeEach(() => {
  vi.resetAllMocks();
  // $transaction(fn) executa a função usando o próprio mock como "tx"
  prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
});