import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedPrincipal, Permission } from "@itqanak/auth";
import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "@itqanak/db";

import { PlatformOperationsService } from "../src/service.js";

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;
const rollbackMarker = { operationalControlsRollback: true } as const;
const permissions = [
  "admin.dashboard.view",
  "admin.operations.read",
  "admin.operations.manage",
] as const satisfies readonly Permission[];

function transactionFacade(transaction: DatabaseClient): DatabaseClient {
  let facade: DatabaseClient;
  facade = new Proxy(transaction, {
    apply(target, thisArgument, argumentsList) {
      return Reflect.apply(target, thisArgument, argumentsList);
    },
    get(target, property, receiver) {
      if (property === "begin") {
        // The service owns its production transaction. This suite already runs
        // inside a rollback-only transaction, so adapt nested begin to that
        // same connection instead of pretending postgres.js TransactionSql
        // exposes a begin method.
        return async (callback: (nested: DatabaseClient) => Promise<unknown>) => callback(facade);
      }
      return Reflect.get(target, property, receiver);
    },
  }) as DatabaseClient;
  return facade;
}

async function inRolledBackTransaction(
  database: DatabaseClient,
  callback: (transaction: DatabaseClient) => Promise<void>,
): Promise<void> {
  try {
    await database.begin(async (transaction) => {
      await callback(transactionFacade(transaction as DatabaseClient));
      throw rollbackMarker;
    });
    throw new Error("Operational-controls integration transaction unexpectedly committed.");
  } catch (error: unknown) {
    if (error !== rollbackMarker) throw error;
  }
}

async function expectRejectedMutation(
  transaction: DatabaseClient,
  mutation: () => Promise<unknown>,
): Promise<void> {
  await transaction.unsafe("SAVEPOINT operational_controls_guard_probe");
  let rejection: unknown;
  try {
    await mutation();
  } catch (error: unknown) {
    rejection = error;
  } finally {
    await transaction.unsafe("ROLLBACK TO SAVEPOINT operational_controls_guard_probe");
    await transaction.unsafe("RELEASE SAVEPOINT operational_controls_guard_probe");
  }
  expect(rejection).toBeInstanceOf(Error);
}

integrationDescribe.sequential("platform operational controls integration", () => {
  let database: DatabaseClient;

  beforeAll(async () => {
    database = createDatabase(integrationDatabaseUrl!);
    await runMigrations(database, {
      migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    });
  });

  afterAll(async () => {
    await closeDatabase(database);
  });

  it("seeds one safe state and grants explicit administrator capabilities", async () => {
    const rows = await database<
      {
        readonly singleton_key: string;
        readonly maintenance_enabled: boolean;
        readonly file_scan_queue_paused: boolean;
        readonly file_scanner_observed_state: string;
        readonly version: number;
      }[]
    >`
      SELECT singleton_key, maintenance_enabled, file_scan_queue_paused,
             file_scanner_observed_state, version
      FROM platform_operational_settings
    `;
    expect(rows).toEqual([
      {
        singleton_key: "platform",
        maintenance_enabled: false,
        file_scan_queue_paused: true,
        file_scanner_observed_state: "UNKNOWN",
        version: 2,
      },
    ]);
    const applied = await database<{ readonly filename: string }[]>`
      SELECT filename
      FROM schema_migrations
      WHERE filename = '017_platform_operational_controls.sql'
    `;
    expect(applied).toEqual([{ filename: "017_platform_operational_controls.sql" }]);
    const grants = await database<
      { readonly role_code: string; readonly permission_code: string }[]
    >`
      SELECT role_code, permission_code
      FROM role_permissions
      WHERE permission_code IN ('admin.operations.read', 'admin.operations.manage')
      ORDER BY role_code, permission_code
    `;
    expect(grants).toEqual([
      { role_code: "ADMIN", permission_code: "admin.operations.manage" },
      { role_code: "ADMIN", permission_code: "admin.operations.read" },
      { role_code: "SYSTEM", permission_code: "admin.operations.read" },
    ]);
  });

  it("updates optimistically and records both database and security audit history", async () => {
    await inRolledBackTransaction(database, async (transaction) => {
      const userId = randomUUID();
      const sessionId = randomUUID();
      const email = `operations-${randomUUID()}@example.test`;
      await transaction`
        INSERT INTO users (
          id, email, email_normalized, display_name, status, email_verified_at
        ) VALUES (
          ${userId}, ${email}, ${email}, 'Operations fixture', 'ACTIVE', now()
        )
      `;
      await transaction`
        INSERT INTO user_sessions (
          id, user_id, selector, validator_hash, expires_at, idle_expires_at
        ) VALUES (
          ${sessionId}, ${userId}, ${randomUUID().replaceAll("-", "")},
          ${"d".repeat(64)}, now() + interval '1 day', now() + interval '1 day'
        )
      `;
      await transaction`
        INSERT INTO user_roles (user_id, role_code)
        VALUES (${userId}, 'ADMIN')
      `;
      const principal: AuthenticatedPrincipal = {
        userId,
        sessionId,
        displayName: "Operations fixture",
        roles: ["ADMIN"],
        permissions,
        email,
        status: "ACTIVE",
      };
      const service = new PlatformOperationsService({ database: transaction });
      const before = await service.getAdminState(principal);
      const updated = await service.updateState(principal, {
        maintenanceEnabled: true,
        maintenanceMessageAr: "المنصة متوقفة مؤقتاً لإجراء صيانة مخططة.",
        maintenanceMessageEn: "The platform is temporarily offline for planned maintenance.",
        fileScanQueuePaused: true,
        expectedVersion: before.version,
        confirmedCriticalAction: true,
      });
      expect(updated).toMatchObject({
        maintenanceEnabled: true,
        fileScanQueuePaused: true,
        version: before.version + 1,
      });

      const events = await transaction<
        {
          readonly actor_user_id: string;
          readonly version: number;
          readonly previous_state: { readonly maintenanceEnabled: boolean };
          readonly next_state: { readonly maintenanceEnabled: boolean };
        }[]
      >`
        SELECT actor_user_id, version, previous_state, next_state
        FROM platform_operational_setting_events
        WHERE actor_user_id = ${userId}
      `;
      expect(events).toEqual([
        expect.objectContaining({
          actor_user_id: userId,
          version: updated.version,
          previous_state: expect.objectContaining({ maintenanceEnabled: false }),
          next_state: expect.objectContaining({ maintenanceEnabled: true }),
        }),
      ]);
      const securityEvents = await transaction<{ readonly event_type: string }[]>`
        SELECT event_type
        FROM security_audit_events
        WHERE actor_user_id = ${userId}
          AND event_type = 'PLATFORM_OPERATIONAL_SETTINGS_UPDATED'
      `;
      expect(securityEvents).toEqual([{ event_type: "PLATFORM_OPERATIONAL_SETTINGS_UPDATED" }]);

      await transaction`
        UPDATE platform_operational_settings
        SET file_scanner_observed_state = 'STOPPED',
            file_scanner_observed_at = now(),
            file_scanner_observed_detail = 'desired_paused'
        WHERE singleton_key = 'platform'
      `;
      await expect(service.getRuntimeState()).resolves.toMatchObject({
        fileScanQueuePaused: true,
        fileScannerObservedState: "STOPPED",
        fileScannerObservedDetail: "desired_paused",
        version: updated.version,
      });
      const observedEvents = await transaction<
        { readonly event_type: string; readonly actor_user_id: string | null }[]
      >`
        SELECT event_type, actor_user_id
        FROM platform_operational_setting_events
        WHERE event_type = 'FILE_SCANNER_STATE_OBSERVED'
          AND version = ${updated.version}
      `;
      expect(observedEvents).toEqual([
        { event_type: "FILE_SCANNER_STATE_OBSERVED", actor_user_id: null },
      ]);

      await expect(
        service.updateState(principal, {
          maintenanceEnabled: false,
          maintenanceMessageAr: updated.maintenanceMessageAr,
          maintenanceMessageEn: updated.maintenanceMessageEn,
          fileScanQueuePaused: false,
          expectedVersion: before.version,
          confirmedCriticalAction: false,
        }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

      const eventId = await transaction<{ readonly id: string }[]>`
        SELECT id::text AS id
        FROM platform_operational_setting_events
        WHERE actor_user_id = ${userId}
        LIMIT 1
      `;
      await expectRejectedMutation(
        transaction,
        async () => transaction`
          UPDATE platform_operational_setting_events
          SET next_state = '{}'::jsonb
          WHERE id = ${eventId[0]?.id ?? "0"}::bigint
        `,
      );
      await expectRejectedMutation(
        transaction,
        async () => transaction`
          DELETE FROM platform_operational_settings WHERE singleton_key = 'platform'
        `,
      );
    });
  });

  it("narrows runtime grants when the external role is present", async () => {
    const role = await database<{ readonly present: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqanak_runtime') AS present
    `;
    if (role[0]?.present !== true) return;
    const grants = await database<
      {
        readonly settings_select: boolean;
        readonly settings_insert: boolean;
        readonly settings_update: boolean;
        readonly settings_delete: boolean;
        readonly desired_column_update: boolean;
        readonly observed_column_update: boolean;
        readonly events_select: boolean;
        readonly events_insert: boolean;
        readonly events_update: boolean;
        readonly events_delete: boolean;
      }[]
    >`
      SELECT
        has_table_privilege('itqanak_runtime', 'platform_operational_settings', 'SELECT') AS settings_select,
        has_table_privilege('itqanak_runtime', 'platform_operational_settings', 'INSERT') AS settings_insert,
        has_table_privilege('itqanak_runtime', 'platform_operational_settings', 'UPDATE') AS settings_update,
        has_table_privilege('itqanak_runtime', 'platform_operational_settings', 'DELETE') AS settings_delete,
        has_column_privilege('itqanak_runtime', 'platform_operational_settings', 'file_scan_queue_paused', 'UPDATE') AS desired_column_update,
        has_column_privilege('itqanak_runtime', 'platform_operational_settings', 'file_scanner_observed_state', 'UPDATE') AS observed_column_update,
        has_table_privilege('itqanak_runtime', 'platform_operational_setting_events', 'SELECT') AS events_select,
        has_table_privilege('itqanak_runtime', 'platform_operational_setting_events', 'INSERT') AS events_insert,
        has_table_privilege('itqanak_runtime', 'platform_operational_setting_events', 'UPDATE') AS events_update,
        has_table_privilege('itqanak_runtime', 'platform_operational_setting_events', 'DELETE') AS events_delete
    `;
    expect(grants[0]).toEqual({
      settings_select: true,
      settings_insert: false,
      settings_update: false,
      settings_delete: false,
      desired_column_update: true,
      observed_column_update: false,
      events_select: true,
      events_insert: false,
      events_update: false,
      events_delete: false,
    });
  });
});
