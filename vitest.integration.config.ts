import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts", "packages/**/test/**/*.integration.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    environment: "node",
    // Integration suites exercise the production invariant that exactly one
    // ADMIN exists. Run files serially so each suite can remove its fixture.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
