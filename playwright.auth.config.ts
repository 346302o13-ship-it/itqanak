import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/auth-e2e",
  timeout: 60_000,
  retries: process.env.CI === "true" ? 1 : 0,
  use: {
    baseURL: process.env.AUTH_E2E_BASE_URL ?? "http://127.0.0.1:8080",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
