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
    expect(safe.fileScanning).toEqual({ mode: "disabled" });
    expect(safe.operationalControls).toEqual({ maintenanceCacheTtlMs: 2_000 });
    expect(safe.storage.hasLocalPath).toBe(true);
  });

  it("rejects unsafe production endpoints", () => {
    expect(() =>
      loadConfig({
        environment: {
          NODE_ENV: "production",
          PUBLIC_APP_URL: "http://localhost:8080",
          ADMIN_APP_URL: "http://localhost:8080/ar/admin",
        },
        requirements: { storage: true, fileScanning: true },
        serviceName: "test",
      }),
    ).toThrow(ConfigError);
  });

  it("rejects disabled file scanning and local storage in production", () => {
    expect(() =>
      loadConfig({
        environment: {
          NODE_ENV: "production",
          PUBLIC_APP_URL: "https://app.itqanak.test",
          ADMIN_APP_URL: "https://admin.itqanak.test/ar/admin",
          FILE_SCAN_MODE: "disabled",
          STORAGE_DRIVER: "local",
        },
        requirements: { storage: true, fileScanning: true },
        serviceName: "test",
      }),
    ).toThrow(ConfigError);
  });

  it("accepts private S3 and ClamAV production configuration without exposing secrets", () => {
    const config = loadConfig({
      environment: {
        NODE_ENV: "production",
        PUBLIC_APP_URL: "https://app.itqanak.test",
        ADMIN_APP_URL: "https://admin.itqanak.test/ar/admin",
        FILE_SCAN_MODE: "clamav",
        STORAGE_DRIVER: "s3",
        STORAGE_S3_ENDPOINT: "https://objects.itqanak.test",
        STORAGE_S3_REGION: "test-region-1",
        STORAGE_S3_BUCKET: "itqanak-private",
        STORAGE_S3_ACCESS_KEY_ID: "private-access-key",
        STORAGE_S3_SECRET_ACCESS_KEY: "private-secret-key",
      },
      requirements: { storage: true, fileScanning: true },
      serviceName: "test",
    });

    const safe = toSafeConfig(config);
    expect(safe.fileScanning).toEqual({ mode: "clamav" });
    expect(safe.storage.hasS3Configuration).toBe(true);
    expect(JSON.stringify(safe)).not.toContain("private-access-key");
    expect(JSON.stringify(safe)).not.toContain("private-secret-key");
    expect(JSON.stringify(safe)).not.toContain("objects.itqanak.test");
  });

  it("rejects an insecure S3 endpoint in production", () => {
    expect(() =>
      loadConfig({
        environment: {
          NODE_ENV: "production",
          PUBLIC_APP_URL: "https://app.itqanak.test",
          ADMIN_APP_URL: "https://admin.itqanak.test/ar/admin",
          FILE_SCAN_MODE: "clamav",
          STORAGE_DRIVER: "s3",
          STORAGE_S3_ENDPOINT: "http://objects.itqanak.test",
          STORAGE_S3_REGION: "test-region-1",
          STORAGE_S3_BUCKET: "itqanak-private",
          STORAGE_S3_ACCESS_KEY_ID: "access-key",
          STORAGE_S3_SECRET_ACCESS_KEY: "secret-key",
        },
        requirements: { storage: true, fileScanning: true },
        serviceName: "test",
      }),
    ).toThrow(ConfigError);
  });

  it("accepts only the exact private Docker MinIO endpoint over HTTP", () => {
    const sharedEnvironment = {
      NODE_ENV: "production",
      PUBLIC_APP_URL: "https://app.itqanak.test",
      ADMIN_APP_URL: "https://admin.itqanak.test/ar/admin",
      FILE_SCAN_MODE: "clamav",
      STORAGE_DRIVER: "s3",
      STORAGE_S3_REGION: "test-region-1",
      STORAGE_S3_BUCKET: "itqanak-private",
      STORAGE_S3_ACCESS_KEY_ID: "access-key",
      STORAGE_S3_SECRET_ACCESS_KEY: "secret-key",
    } as const;

    expect(() =>
      loadConfig({
        environment: { ...sharedEnvironment, STORAGE_S3_ENDPOINT: "http://minio:9000" },
        requirements: { storage: true, fileScanning: true },
        serviceName: "test",
      }),
    ).not.toThrow();
    for (const endpoint of [
      "http://minio.example.test:9000",
      "http://minio:9001",
      "http://127.0.0.1:9000",
      "http://minio:9000/unexpected",
    ]) {
      expect(() =>
        loadConfig({
          environment: { ...sharedEnvironment, STORAGE_S3_ENDPOINT: endpoint },
          requirements: { storage: true, fileScanning: true },
          serviceName: "test",
        }),
      ).toThrow(ConfigError);
    }
  });

  it("does not require application-only storage or scanner secrets from a production migrator", () => {
    const config = loadConfig({
      environment: {
        NODE_ENV: "production",
        PUBLIC_APP_URL: "https://app.itqanak.test",
        ADMIN_APP_URL: "https://admin.itqanak.test/ar/admin",
      },
      requirements: { database: false },
      serviceName: "migrator",
    });
    expect(config.storage.driver).toBe("local");
    expect(config.fileScanning.mode).toBe("disabled");
  });

  it("validates the centralized per-file, file-count, and total upload limits", () => {
    expect(() =>
      loadConfig({
        environment: {
          NODE_ENV: "test",
          PUBLIC_APP_URL: "https://app.itqanak.test",
          ADMIN_APP_URL: "https://admin.itqanak.test/ar/admin",
          UPLOAD_MAX_FILE_BYTES: "20971520",
          UPLOAD_MAX_TOTAL_BYTES_PER_REQUEST: "1024",
        },
        serviceName: "test",
      }),
    ).toThrow(ConfigError);
  });

  it("requires a non-empty academic-integrity policy version", () => {
    expect(() =>
      loadConfig({
        environment: {
          NODE_ENV: "test",
          PUBLIC_APP_URL: "https://app.itqanak.test",
          ADMIN_APP_URL: "https://admin.itqanak.test/ar/admin",
          ACADEMIC_INTEGRITY_VERSION: "   ",
        },
        serviceName: "test",
      }),
    ).toThrow(ConfigError);
  });

  it("bounds the maintenance-state cache to a short operational interval", () => {
    const config = loadConfig({
      environment: {
        NODE_ENV: "test",
        OPERATIONAL_STATE_CACHE_TTL_MS: "750",
      },
      serviceName: "test",
    });
    expect(config.operationalControls.maintenanceCacheTtlMs).toBe(750);
    expect(() =>
      loadConfig({
        environment: { NODE_ENV: "test", OPERATIONAL_STATE_CACHE_TTL_MS: "10001" },
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

  it("requires complete Meta delivery settings and never exposes the access token", () => {
    expect(() =>
      loadConfig({
        environment: { NODE_ENV: "test", WHATSAPP_MODE: "enabled" },
        serviceName: "test",
      }),
    ).toThrow(ConfigError);

    const config = loadConfig({
      environment: {
        NODE_ENV: "test",
        WHATSAPP_MODE: "enabled",
        WHATSAPP_PHONE_NUMBER_ID: "1260466807145770",
        WHATSAPP_TEMPLATE_NAME: "itqanak_support_event_v1",
        WHATSAPP_TEMPLATE_LANGUAGE: "ar",
        WHATSAPP_GRAPH_API_VERSION: "v25.0",
        WHATSAPP_SUPPORT_RECIPIENT_E164: "+966564202263",
        WHATSAPP_NOTIFICATIONS_NOT_BEFORE: "2026-08-13T00:00:00Z",
        WHATSAPP_ACCESS_TOKEN: "private-system-user-token-long-enough",
      },
      serviceName: "test",
    });
    const safe = toSafeConfig(config);
    expect(safe.hasWhatsAppAccessToken).toBe(true);
    expect(safe.whatsapp.notificationsNotBefore).toBe("2026-08-13T00:00:00.000Z");
    expect(JSON.stringify(safe)).not.toContain("private-system-user-token");
  });
});
