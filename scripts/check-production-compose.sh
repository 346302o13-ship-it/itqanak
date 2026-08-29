#!/usr/bin/env bash
# Renders compose.production.yaml with a full placeholder secret set and asserts
# the properties that keep the production topology safe: every long-running
# service is supervised and health-checked, the app tier is a read-only
# capability-dropped rootfs, database/redis URLs are only ever mounted as files,
# and the loopback gateway is the single published port. It never starts a
# container -- `docker compose config` is enough.
set -euo pipefail

export ITQANAK_DATABASE_URL_SECRET_FILE=/dev/null
export ITQANAK_RUNTIME_DATABASE_URL_SECRET_FILE=/dev/null
export ITQANAK_REDIS_URL_SECRET_FILE=/dev/null
export ITQANAK_POSTGRES_PASSWORD_SECRET_FILE=/dev/null
export ITQANAK_REDIS_PASSWORD_SECRET_FILE=/dev/null
export ITQANAK_AUTH_EMAIL_PAYLOAD_KEY_SECRET_FILE=/dev/null
export ITQANAK_SMTP_PASSWORD_SECRET_FILE=/dev/null
export ITQANAK_WHATSAPP_ACCESS_TOKEN_SECRET_FILE=/dev/null
export ITQANAK_STORAGE_S3_ACCESS_KEY_ID_SECRET_FILE=/dev/null
export ITQANAK_STORAGE_S3_SECRET_ACCESS_KEY_SECRET_FILE=/dev/null
export ITQANAK_STORAGE_S3_ROOT_ACCESS_KEY_ID_SECRET_FILE=/dev/null
export ITQANAK_STORAGE_S3_ROOT_SECRET_ACCESS_KEY_SECRET_FILE=/dev/null
export ITQANAK_STORAGE_S3_REGION=us-east-1
export ITQANAK_STORAGE_S3_BUCKET=itqanak-private-ci

rendered_json="$(docker compose -f compose.production.yaml config --format json)"

printf '%s' "$rendered_json" | node -e '
const model = JSON.parse(require("fs").readFileSync(0, "utf8"));
const services = model.services ?? {};
const oneShots = new Set(["migrate", "minio-init"]);
const appTier = ["web", "worker"];
const dataTier = ["postgres", "redis", "minio"];
let failed = false;
const fail = (msg) => { console.error("error: " + msg); failed = true; };

for (const [name, svc] of Object.entries(services)) {
  const restart = svc.restart ?? "no";
  if (oneShots.has(name)) {
    if (restart !== "no") fail(`${name} is a one-shot but restart is "${restart}"`);
    continue;
  }
  if (name === "clamav") continue; // opt-in profile, started by the host reconciler
  if (restart !== "unless-stopped") {
    fail(`${name} must set restart: unless-stopped (got "${restart}")`);
  }
  if (!svc.healthcheck || !Array.isArray(svc.healthcheck.test) || svc.healthcheck.test.length === 0) {
    fail(`${name} has no healthcheck`);
  }
}

// The gateway is the only service allowed to publish a port, and only on loopback.
for (const [name, svc] of Object.entries(services)) {
  for (const port of svc.ports ?? []) {
    const hostIp = port.host_ip ?? "0.0.0.0";
    const published = String(port.published ?? "");
    if (name !== "gateway") fail(`${name} publishes a port; only the gateway may`);
    if (hostIp !== "127.0.0.1") fail(`${name} publishes ${published} on ${hostIp}, expected 127.0.0.1`);
  }
}

// App + data tiers run a read-only rootfs with every capability dropped.
for (const name of [...appTier, ...dataTier]) {
  const svc = services[name];
  if (!svc) { fail(`expected service ${name} is missing`); continue; }
  if (svc.read_only !== true) fail(`${name} must run read_only: true`);
  const caps = (svc.cap_drop ?? []).map((c) => String(c).toUpperCase());
  if (!caps.includes("ALL")) fail(`${name} must cap_drop: ALL`);
  if (svc.security_opt && !svc.security_opt.some((o) => /no-new-privileges:\s*true/.test(String(o)))) {
    fail(`${name} must set no-new-privileges:true`);
  }
}

// Database / Redis URLs and other secrets are file-mounted, never plain env.
const forbiddenEnv = ["DATABASE_URL", "REDIS_URL", "STORAGE_S3_SECRET_ACCESS_KEY", "AUTH_EMAIL_PAYLOAD_KEY"];
for (const name of [...appTier, "migrate"]) {
  const env = services[name]?.environment ?? {};
  for (const key of forbiddenEnv) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      fail(`${name} sets ${key} as plain env; use ${key}_FILE`);
    }
  }
}

// The web healthcheck must probe the real startup endpoint.
const webTest = (services.web?.healthcheck?.test ?? []).join(" ");
if (!/\/api\/health\/startup/.test(webTest)) {
  fail(`web healthcheck must probe /api/health/startup (got: ${webTest || "none"})`);
}
// web must verify the DB schema on boot.
if (services.web?.environment?.VERIFY_SCHEMA_ON_STARTUP !== "true") {
  fail("web must set VERIFY_SCHEMA_ON_STARTUP=true");
}

// migrate must complete before web starts.
const webDeps = services.web?.depends_on ?? {};
if (webDeps.migrate?.condition !== "service_completed_successfully") {
  fail("web must depend_on migrate: service_completed_successfully");
}

if (failed) process.exit(1);
console.log("production compose topology checks passed.");
'
