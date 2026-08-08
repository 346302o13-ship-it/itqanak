#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { loadConfig } from "@itqanak/config";
import { closeDatabase, createDatabase } from "@itqanak/db";

import { AuthService } from "./service.js";

type Command = "create-admin" | "grant-role" | "revoke-role" | "cleanup-expired" | "list-sessions";

function isControlCharacter(value: string): boolean {
  const codePoint = value.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
}

function commandFromArguments(value: string | undefined): Command | undefined {
  if (
    value === "create-admin" ||
    value === "grant-role" ||
    value === "revoke-role" ||
    value === "cleanup-expired" ||
    value === "list-sessions"
  ) {
    return value;
  }
  return undefined;
}

async function prompt(question: string): Promise<string> {
  const readline = createInterface({ input: stdin, output: stdout, terminal: true });
  try {
    return (await readline.question(question)).trim();
  } finally {
    readline.close();
  }
}

async function promptSecret(question: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || stdin.setRawMode === undefined) {
    throw new Error("Password input requires an interactive terminal.");
  }
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const onData = (chunk: Buffer) => {
      const character = chunk.toString("utf8");
      if (character === "\u0003") {
        cleanup();
        reject(new Error("Operation cancelled."));
        return;
      }
      if (character === "\r" || character === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (character === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      for (const inputCharacter of character) {
        if (!isControlCharacter(inputCharacter)) {
          value += inputCharacter;
        }
      }
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode?.(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

async function confirm(message: string): Promise<boolean> {
  return (await prompt(`${message} [yes/no]: `)).toLowerCase() === "yes";
}

async function run(): Promise<void> {
  const command = commandFromArguments(process.argv[2]);
  if (command === undefined) {
    process.stderr.write(
      "Usage: itqanak-auth <create-admin|grant-role|revoke-role|cleanup-expired|list-sessions>\n",
    );
    process.exitCode = 2;
    return;
  }
  const config = loadConfig({
    serviceName: "auth-cli",
    requirements: { database: true },
    loadDotenv: process.env.NODE_ENV !== "production",
  });
  const database = createDatabase(config.databaseUrl ?? "");
  const auth = new AuthService({ database, config });
  try {
    if (command === "cleanup-expired") {
      const result = await auth.cleanupExpired();
      process.stdout.write(
        `Cleanup completed: sessions=${result.sessions}, verificationTokens=${result.verificationTokens}, resetTokens=${result.resetTokens}, sentPayloads=${result.sentPayloads}\n`,
      );
      return;
    }
    if (command === "create-admin") {
      const displayName = await prompt("Display name: ");
      const email = await prompt("Email: ");
      const password = await promptSecret("Password: ");
      const confirmation = await promptSecret("Confirm password: ");
      if (password !== confirmation) {
        throw new Error("Passwords do not match.");
      }
      if (!(await confirm("Create an ACTIVE ADMIN account"))) {
        process.stdout.write("Cancelled.\n");
        return;
      }
      await auth.createAdmin({ displayName, email, password });
      process.stdout.write("Administrator account created.\n");
      return;
    }
    if (command === "grant-role" || command === "revoke-role") {
      const email = await prompt("Account email: ");
      const role = (await prompt("Role (STUDENT or ADMIN): ")).toUpperCase();
      if (role !== "STUDENT" && role !== "ADMIN") {
        throw new Error("Only STUDENT and ADMIN can be changed by this CLI.");
      }
      if (!(await confirm(`${command === "grant-role" ? "Grant" : "Revoke"} ${role}`))) {
        process.stdout.write("Cancelled.\n");
        return;
      }
      if (command === "grant-role") {
        await auth.grantRole(email, role);
        process.stdout.write("Role granted and active sessions revoked.\n");
      } else {
        await auth.revokeRole(email, role);
        process.stdout.write("Role revoked and active sessions revoked.\n");
      }
      return;
    }
    const email = await prompt("Account email: ");
    const normalized = email.trim().toLocaleLowerCase("en-US");
    const rows = await database<
      {
        readonly id: string;
        readonly created_at: Date;
        readonly last_seen_at: Date;
        readonly revoked_at: Date | null;
      }[]
    >`
      SELECT user_sessions.id, user_sessions.created_at, user_sessions.last_seen_at, user_sessions.revoked_at
      FROM user_sessions JOIN users ON users.id = user_sessions.user_id
      WHERE users.email_normalized = ${normalized}
      ORDER BY user_sessions.created_at DESC
    `;
    process.stdout.write(`Session count: ${rows.length}\n`);
    for (const row of rows) {
      process.stdout.write(
        `${row.id} created=${row.created_at.toISOString()} lastSeen=${row.last_seen_at.toISOString()} revoked=${row.revoked_at === null ? "no" : "yes"}\n`,
      );
    }
  } finally {
    await closeDatabase(database);
  }
}

void run().catch(() => {
  process.stderr.write("Authentication administration command failed.\n");
  process.exitCode = 1;
});
