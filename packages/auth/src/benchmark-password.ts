import { randomBytes } from "node:crypto";

import { argon2idOptions, hashPassword } from "./password.js";

async function run(): Promise<void> {
  // Deliberately generated in-memory test material; it is never printed or saved.
  const sample = randomBytes(24).toString("base64url");
  const startedAt = performance.now();
  await hashPassword(sample);
  const elapsedMs = Math.round(performance.now() - startedAt);
  process.stdout.write(
    `Argon2id benchmark: ${elapsedMs}ms (memory=${argon2idOptions.memoryCost}KiB, time=${argon2idOptions.timeCost}, parallelism=${argon2idOptions.parallelism})\n`,
  );
}

void run().catch(() => {
  process.stderr.write("Argon2id benchmark failed.\n");
  process.exitCode = 1;
});
