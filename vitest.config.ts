import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    environment: "node",
    restoreMocks: true,
    coverage: {
      reporter: ["text", "html"],
      exclude: ["**/*.test.ts"],
    },
  },
});
