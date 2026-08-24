import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { ClamAvTcpScanner } from "./index.js";

const integrationHost = process.env.TEST_CLAMAV_HOST;
const integrationPort = Number(process.env.TEST_CLAMAV_PORT ?? "3310");
const antivirusDescribe = integrationHost === undefined ? describe.skip : describe;

antivirusDescribe("ClamAV profile integration", () => {
  const scanner = new ClamAvTcpScanner({
    host: integrationHost ?? "clamav",
    port: integrationPort,
    connectTimeoutMs: 5_000,
    scanTimeoutMs: 30_000,
  });

  it("reports readiness and accepts a clean stream", async () => {
    await expect(scanner.checkReadiness()).resolves.toBe("healthy");
    await expect(
      scanner.scan(Readable.from(["ITQANAK clean integration payload"])),
    ).resolves.toEqual({ status: "CLEAN" });
  });

  it("detects the standard antivirus test signature without committing a test file", async () => {
    const signature = [
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$",
      "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!",
      "$H+H*",
    ].join("");
    await expect(scanner.scan(Readable.from([signature]))).resolves.toEqual({
      status: "INFECTED",
    });
  });
});
