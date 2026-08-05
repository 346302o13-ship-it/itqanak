import { describe, expect, it } from "vitest";

import { createLogger } from "./logger.js";

describe("structured logging", () => {
  it("redacts secret and personal fields", () => {
    const output: string[] = [];
    const logger = createLogger({
      service: "test",
      environment: "test",
      write: (line) => output.push(line),
    });
    logger.info("event", { authorization: "Bearer private-token", email: "student@example.test" });
    expect(output).toHaveLength(1);
    expect(output[0]).toContain("[REDACTED]");
    expect(output[0]).not.toContain("private-token");
    expect(output[0]).not.toContain("student@example.test");
  });
});
