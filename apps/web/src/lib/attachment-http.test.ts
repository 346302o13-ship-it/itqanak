import { describe, expect, it } from "vitest";

import { attachmentContentDisposition } from "./attachment-http";

describe("attachment download headers", () => {
  it("uses an ASCII fallback and RFC 5987 encoding for the original name", () => {
    const value = attachmentContentDisposition("مشروع نهائي.pdf");
    expect(value).toContain('filename="itqanak-attachment.pdf"');
    expect(value).toContain("filename*=UTF-8''%D9%85");
  });

  it("does not allow metadata to create a second response header", () => {
    const value = attachmentContentDisposition('unsafe"\r\nX-Evil: yes.pdf');
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    expect(value).not.toContain('unsafe"');
    expect(value).toContain("%0D%0A");
  });
});
