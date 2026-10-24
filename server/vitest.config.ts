import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? "postgresql://app:app@localhost:5432/plataforma_test", NODE_ENV: "test" },
    globalSetup: "./test/global-setup.ts",
    fileParallelism: false,
    testTimeout: 20000,
  },
});
