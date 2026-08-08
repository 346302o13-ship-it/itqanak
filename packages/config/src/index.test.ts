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

  it("requires an encryption key for enabled authentication-email delivery but not disabled delivery", () => {
    const baseEnvironment = {
      NODE_ENV: "test",
      PUBLIC_APP_URL: "https://app.itqanak.test",
      ADMIN_APP_URL: "https://admin.itqanak.test/ar/admin",
      EMAIL_DELIVERY_MODE: "test",
    } as const;
    expect(() => loadConfig({ environment: baseEnvironment, serviceName: "test" })).toThrow(
      ConfigError,
    );

    const config = loadConfig({
      environment: {
        ...baseEnvironment,
        AUTH_EMAIL_PAYLOAD_KEY: Buffer.alloc(32, 9).toString("base64"),
      },
      serviceName: "test",
    });
    expect(config.auth.emailPayloadKey).toBeDefined();
    expect(
      loadConfig({
        environment: { ...baseEnvironment, EMAIL_DELIVERY_MODE: "disabled" },
        serviceName: "test",
      }).auth.emailPayloadKey,
    ).toBeUndefined();
  });

  it("treats an empty direct optional secret as absent", () => {
    const config = loadConfig({
      environment: {
        NODE_ENV: "development",
        PUBLIC_APP_URL: "http://127.0.0.1:8080",
        ADMIN_APP_URL: "http://127.0.0.1:8080/ar/admin",
        AUTH_EMAIL_PAYLOAD_KEY: "   ",
        EMAIL_DELIVERY_MODE: "disabled",
      },
      serviceName: "test",
    });
    expect(config.auth.emailPayloadKey).toBeUndefined();
  });
});
