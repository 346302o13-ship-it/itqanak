import { defineConfig, devices } from "@playwright/test";

const port = 3101;

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  retries: process.env.CI === "true" ? 2 : 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `PORT=${port} HOSTNAME=127.0.0.1 VERIFY_SCHEMA_ON_STARTUP=false node apps/web/.next/standalone/apps/web/server.js`,
    port,
    reuseExistingServer: process.env.CI !== "true",
    timeout: 60_000,
  },
});
