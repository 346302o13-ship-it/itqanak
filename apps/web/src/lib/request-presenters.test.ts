import { describe, expect, it } from "vitest";

import { requestEventLabel, requestStatusLabel, requestStatusTone } from "./request-presenters";

describe("request presentation", () => {
  it("localizes every public request state without exposing unknown values", () => {
    expect(requestStatusLabel("WAITING_FOR_STUDENT")).toBe("بانتظار ردك");
    expect(requestStatusLabel("INTERNAL_FUTURE_STATE")).toBe("حالة الطلب");
    expect(requestStatusLabel("WAITING_FOR_STUDENT", "en")).toBe("Waiting for your reply");
    expect(requestStatusLabel("INTERNAL_FUTURE_STATE", "en")).toBe("Request status");
  });

  it("assigns accessible status tones", () => {
    expect(requestStatusTone("COMPLETED")).toBe("success");
    expect(requestStatusTone("CANCELLED")).toBe("warning");
    expect(requestStatusTone("SUBMITTED")).toBe("info");
  });

  it("localizes timeline events without rendering an unknown database code", () => {
    expect(requestEventLabel("REQUEST_SUBMITTED")).toBe("تم إرسال الطلب");
    expect(requestEventLabel("PRIVATE_INTERNAL_EVENT")).toBe("تم تحديث سجل الطلب");
    expect(requestEventLabel("REQUEST_SUBMITTED", "en")).toBe("Request submitted");
    expect(requestEventLabel("PRIVATE_INTERNAL_EVENT", "en")).toBe("Request history updated");
  });
});
