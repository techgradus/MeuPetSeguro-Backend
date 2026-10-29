import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    env: {
      JWT_SECRET: "segredo-de-teste",
      DATABASE_URL: "postgresql://teste:teste@localhost:5432/teste",
    },
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/types/**"],
      reporter: ["text-summary", "html"],
    },
  },
});
