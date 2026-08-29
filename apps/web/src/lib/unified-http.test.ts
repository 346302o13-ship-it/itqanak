import { describe, expect, it } from "vitest";

import {
  conversationListInput,
  jsonReady,
  messageListInput,
  notificationListInput,
  quoteWithdrawalInput,
} from "./unified-http";

describe("unified conversation HTTP mapping", () => {
  it("serializes service dates as ISO strings", () => {
    expect(
      jsonReady({ createdAt: new Date("2026-08-20T12:30:00.000Z"), nested: [{ readAt: null }] }),
    ).toEqual({ createdAt: "2026-08-20T12:30:00.000Z", nested: [{ readAt: null }] });
  });

  it("bounds conversation and message pagination", () => {
    expect(messageListInput(new URLSearchParams("page=2&pageSize=999"))).toEqual({
      page: 2,
      pageSize: 100,
    });
    expect(conversationListInput(new URLSearchParams("q=%20student%20&pageSize=40"))).toEqual({
      page: 1,
      pageSize: 40,
      search: "student",
    });
  });

  it("accepts a valid afterId cursor for incremental message polling and rejects a bad one", () => {
    expect(
      messageListInput(new URLSearchParams("afterId=5448f705-91a9-4ab6-84ca-fd21abf96891")),
    ).toEqual({
      page: 1,
      pageSize: 50,
      afterId: "5448f705-91a9-4ab6-84ca-fd21abf96891",
    });
    expect(messageListInput(new URLSearchParams("afterId=not-a-uuid"))).toEqual({
      page: 1,
      pageSize: 50,
    });
  });

  it("supports unread-only notification polling", () => {
    expect(notificationListInput(new URLSearchParams("unreadOnly=true"))).toEqual({
      page: 1,
      pageSize: 20,
      unreadOnly: true,
    });
  });

  it("maps the quote withdrawal concurrency and idempotency fields", () => {
    const form = new FormData();
    form.set("expectedVersion", "2");
    form.set("expectedRequestVersion", "7");
    form.set("clientActionId", "5448f705-91a9-4ab6-84ca-fd21abf96891");
    expect(quoteWithdrawalInput(form)).toEqual({
      expectedVersion: 2,
      expectedRequestVersion: 7,
      clientActionId: "5448f705-91a9-4ab6-84ca-fd21abf96891",
    });
  });
});
