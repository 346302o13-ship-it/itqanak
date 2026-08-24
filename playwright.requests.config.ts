import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/requests-e2e",
  // The development stack compiles each App Router entry on first use. Keep
  // the flow deterministic on cold CI runners while assertion timeouts still
  // catch stalled ordinary interactions.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI === "true" ? 1 : 0,
  use: {
    baseURL: process.env.REQUESTS_E2E_BASE_URL ?? "http://127.0.0.1:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
