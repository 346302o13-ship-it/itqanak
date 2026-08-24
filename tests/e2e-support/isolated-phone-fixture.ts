import { spawn } from "node:child_process";

export type SupportedPhoneCountry = "SA" | "AE" | "KW";

interface PhoneIdentity {
  readonly country: SupportedPhoneCountry;
  readonly local: string;
  readonly e164: string;
}

export interface PhoneVerificationRecord {
  readonly status: string;
  readonly accountStatus: string;
  readonly reference: string | null;
  readonly confirmationAuditCount: number;
}

const fixtureOperatorEmail = "playwright-fixture-operator@example.test";

function e2eProjectName(): string {
  const project = process.env.E2E_COMPOSE_PROJECT_NAME?.trim() ?? "";
  if (
    project.length === 0 ||
    !/(?:^|[-_])(e2e|test)(?:$|[-_])/iu.test(project) ||
    /(?:^|[-_])(prod|production)(?:$|[-_])/iu.test(project)
  ) {
    throw new Error("E2E_COMPOSE_PROJECT_NAME must identify a dedicated e2e/test Compose project.");
  }
  return project;
}

function assertLocalBaseUrl(rawUrl: string): void {
  const url = new URL(rawUrl);
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (url.protocol !== "http:" || !localHosts.has(url.hostname)) {
    throw new Error("Phone E2E tests only run against an explicit local HTTP target.");
  }
}

async function childOutput(
  command: string,
  args: readonly string[],
  input?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(
        new Error(
          `${command} exited with ${String(code)}${stderr.trim().length === 0 ? "" : `: ${stderr.trim()}`}`,
        ),
      );
    });
    child.stdin.end(input);
  });
}

async function composeServiceContainer(project: string, service: "gateway" | "postgres") {
  const containerId = await childOutput("docker", [
    "compose",
    "-p",
    project,
    "ps",
    "--status",
    "running",
    "-q",
    service,
  ]);
  if (containerId.length === 0 || containerId.includes("\n")) {
    throw new Error(`The dedicated E2E ${service} container is not running.`);
  }
  const actualProject = await childOutput("docker", [
    "inspect",
    "--format",
    '{{ index .Config.Labels "com.docker.compose.project" }}',
    containerId,
  ]);
  if (actualProject !== project) {
    throw new Error(`The resolved ${service} container does not belong to the E2E project.`);
  }
  return containerId;
}

async function assertGatewayOwnsTarget(project: string, rawUrl: string): Promise<void> {
  const gateway = await composeServiceContainer(project, "gateway");
  const url = new URL(rawUrl);
  const expectedPort = url.port || "80";
  const published = await childOutput("docker", ["port", gateway, "8080/tcp"]);
  const ownsPort = published
    .split("\n")
    .some(
      (binding) => binding === `127.0.0.1:${expectedPort}` || binding === `[::1]:${expectedPort}`,
    );
  if (!ownsPort) {
    throw new Error("The browser target port is not published by the dedicated E2E gateway.");
  }
}

async function psql(
  sql: string,
  variables: Readonly<Record<string, string>> = {},
): Promise<string> {
  const project = e2eProjectName();
  await composeServiceContainer(project, "postgres");
  const variableArguments = Object.entries(variables).flatMap(([key, value]) => [
    "--set",
    `${key}=${value}`,
  ]);
  return childOutput(
    "docker",
    [
      "compose",
      "-p",
      project,
      "exec",
      "-T",
      "postgres",
      "psql",
      "--username",
      "itqanak",
      "--dbname",
      "itqanak",
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      ...variableArguments,
    ],
    sql,
  );
}

/**
 * Refuse to start browser mutations unless the target and database belong to
 * an explicitly named, local, disposable E2E Compose project.
 */
export async function assertIsolatedPhoneE2eEnvironment(baseUrl: string): Promise<void> {
  assertLocalBaseUrl(baseUrl);
  const project = e2eProjectName();
  await Promise.all([
    composeServiceContainer(project, "postgres"),
    assertGatewayOwnsTarget(project, baseUrl),
  ]);
}

function numericSuffix(length: number): string {
  const entropy = `${Date.now()}${Math.floor(Math.random() * 1_000_000_000)
    .toString()
    .padStart(9, "0")}`;
  return entropy.slice(-length);
}

export function uniquePhone(country: SupportedPhoneCountry): PhoneIdentity {
  if (country === "KW") {
    const subscriber = `5${numericSuffix(7)}`;
    return { country, local: subscriber, e164: `+965${subscriber}` };
  }
  const subscriber = `5${numericSuffix(8)}`;
  return {
    country,
    local: `0${subscriber}`,
    e164: country === "SA" ? `+966${subscriber}` : `+971${subscriber}`,
  };
}

async function ensureFixtureOperator(): Promise<void> {
  await psql(
    `BEGIN;
INSERT INTO users (
  email, email_normalized, display_name, status, email_verified_at
) VALUES (
  :'fixture_email', :'fixture_email', 'Playwright Fixture Operator', 'ACTIVE', now()
)
ON CONFLICT (email_normalized) DO NOTHING;
COMMIT;\n`,
    { fixture_email: fixtureOperatorEmail },
  );
}

/**
 * Test-only bootstrap used before an administrator can exist. Normal student
 * verification is exercised through the real admin UI in the browser tests.
 */
export async function activatePhoneFixture(phoneE164: string): Promise<void> {
  await ensureFixtureOperator();
  const updated = await psql(
    `WITH fixture_operator AS (
  SELECT id FROM users WHERE email_normalized = :'fixture_email'
), activated AS (
  UPDATE users
  SET phone_verified_at = now(),
      phone_verification_status = 'VERIFIED',
      phone_verification_confirmed_at = now(),
      phone_verification_confirmed_by_user_id = (SELECT id FROM fixture_operator),
      phone_verification_reference = 'PLAYWRIGHT-BOOTSTRAP',
      phone_verification_note = 'Isolated E2E database fixture',
      status = 'ACTIVE',
      updated_at = now()
  WHERE phone_e164 = :'phone'
    AND phone_verification_status = 'PENDING'
  RETURNING id
)
SELECT count(*) FROM activated;\n`,
    { fixture_email: fixtureOperatorEmail, phone: phoneE164 },
  );
  if (updated !== "1") {
    throw new Error(`Expected one pending E2E phone account to be activated; received ${updated}.`);
  }
}

export async function grantAdminFixture(phoneE164: string): Promise<void> {
  // Migration 018 permits exactly one administrator. Disposable browser-test
  // databases can be reused between local runs, so retire only earlier
  // Playwright-created administrators before granting the current fixture.
  await psql(
    `DELETE FROM user_roles AS roles
USING users
WHERE roles.user_id = users.id
  AND roles.role_code = 'ADMIN'
  AND users.email_normalized LIKE '%@example.test';\n`,
  );
  const inserted = await psql(
    `WITH fixture_operator AS (
  SELECT id FROM users WHERE email_normalized = :'fixture_email'
), target AS (
  SELECT id FROM users WHERE phone_e164 = :'phone' AND status = 'ACTIVE'
), granted AS (
  INSERT INTO user_roles (user_id, role_code, granted_by_user_id)
  SELECT target.id, 'ADMIN', fixture_operator.id
  FROM target CROSS JOIN fixture_operator
  ON CONFLICT (user_id, role_code) DO NOTHING
  RETURNING user_id
)
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM user_roles JOIN users ON users.id = user_roles.user_id
    WHERE users.phone_e164 = :'phone' AND user_roles.role_code = 'ADMIN'
  ) THEN 1 ELSE 0 END;\n`,
    { fixture_email: fixtureOperatorEmail, phone: phoneE164 },
  );
  if (inserted !== "1") {
    throw new Error("The E2E administrator role was not granted.");
  }
}

export async function bootstrapPhoneAdmin(phoneE164: string): Promise<void> {
  await activatePhoneFixture(phoneE164);
  await grantAdminFixture(phoneE164);
}

export async function phoneVerificationRecord(phoneE164: string): Promise<PhoneVerificationRecord> {
  const raw = await psql(
    `SELECT json_build_object(
  'status', users.phone_verification_status,
  'accountStatus', users.status,
  'reference', users.phone_verification_reference,
  'confirmationAuditCount', (
    SELECT count(*)::integer
    FROM security_audit_events
    WHERE target_user_id = users.id
      AND event_type = 'auth.phone_verification_confirmed'
      AND outcome = 'SUCCESS'
  )
)::text
FROM users
WHERE phone_e164 = :'phone';\n`,
    { phone: phoneE164 },
  );
  if (raw.length === 0) {
    throw new Error("The E2E phone account does not exist in the isolated database.");
  }
  return JSON.parse(raw) as PhoneVerificationRecord;
}
