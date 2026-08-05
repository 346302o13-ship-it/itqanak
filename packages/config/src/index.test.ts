import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig, toSafeConfig } from "./index.js";

describe("configuration", () => {
  it("does not expose secret values in its safe projection", () => {
    const config = loadConfig({
      environment: {
        NODE_ENV: "test",
        PUBLIC_APP_URL: "http://localhost:8080",
        ADMIN_APP_URL: "http://localhost:8080/ar/admin",
        DATABASE_URL: "postgresql://user:private-password@db.example.test:5432/itqanak",
        REDIS_URL: "redis://private-password@redis.example.test:6379/0",
      },
      requirements: { database: true, redis: true },
      serviceName: "test",
    });
    const safe = toSafeConfig(config);
    expect(JSON.stringify(safe)).not.toContain("private-password");
    expect(safe.hasDatabaseUrl).toBe(true);
  });

  it("rejects unsafe production endpoints", () => {
    expect(() =>
      loadConfig({
        environment: {
          NODE_ENV: "production",
          PUBLIC_APP_URL: "http://localhost:8080",
          ADMIN_APP_URL: "http://localhost:8080/ar/admin",
        },
        serviceName: "test",
      }),
    ).toThrow(ConfigError);
  });
});
