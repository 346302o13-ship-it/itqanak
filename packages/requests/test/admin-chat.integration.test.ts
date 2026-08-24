import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedPrincipal, Permission } from "@itqanak/auth";
import { seedDevelopmentCatalog } from "@itqanak/catalog";
import { closeDatabase, createDatabase, runMigrations, type DatabaseClient } from "@itqanak/db";

import { AdminRequestService } from "../src/admin-service.js";
import { ChatService } from "../src/chat-service.js";
import { SupportService } from "../src/support-service.js";

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl === undefined ? describe.skip : describe;

const studentPermissions = [
  "requests.chat.read.own",
  "requests.chat.send.own",
  "support.chat.read.own",
  "support.chat.send.own",
] as const satisfies readonly Permission[];
const adminPermissions = [
  "admin.requests.read",
  "admin.requests.manage",
  "admin.requests.assign",
  "admin.requests.chat.read",
  "admin.requests.chat.send",
  "admin.support.chat.read",
  "admin.support.chat.send",
] as const satisfies readonly Permission[];

interface UserFixture {
  readonly principal: AuthenticatedPrincipal;
}

interface RequestFixture {
  readonly id: string;
  readonly requestNumber: string;
}

async function createUser(
  database: DatabaseClient,
  role: "STUDENT" | "ADMIN",
): Promise<UserFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const email = `${role.toLowerCase()}-${randomUUID()}@example.test`;
  const displayName = role === "ADMIN" ? "مدير اختبار" : "طالب اختبار";
  await database.begin(async (transaction) => {
    const tx = transaction as DatabaseClient;
    await tx`
      INSERT INTO users (
        id, email, email_normalized, display_name, status, email_verified_at
      ) VALUES (${userId}, ${email}, ${email}, ${displayName}, 'ACTIVE', now())
    `;
    await tx`INSERT INTO user_roles (user_id, role_code) VALUES (${userId}, ${role})`;
    await tx`
      INSERT INTO user_sessions (
        id, user_id, selector, validator_hash, expires_at, idle_expires_at
      ) VALUES (
        ${sessionId}, ${userId}, ${randomUUID().replaceAll("-", "")},
        ${"d".repeat(64)}, now() + interval '1 day', now() + interval '1 day'
      )
    `;
  });
  return {
    principal: {
      userId,
      sessionId,
      roles: [role],
      permissions: role === "ADMIN" ? adminPermissions : studentPermissions,
      displayName,
      email,
      status: "ACTIVE",
    },
  };
}

async function createSubmittedRequest(
  database: DatabaseClient,
  studentUserId: string,
  serviceId: string,
  title: string,
): Promise<RequestFixture> {
  const rows = await database<{ readonly id: string; readonly request_number: string }[]>`
    INSERT INTO service_requests (
      student_user_id, service_id, request_kind, status, title, description,
      urgency, submission_key, submission_fingerprint, academic_integrity_version,
      academic_integrity_accepted_at, submitted_at
    ) VALUES (
      ${studentUserId}, ${serviceId}, 'SERVICE', 'SUBMITTED', ${title},
      'تفاصيل طلب تكامل إدارة ومحادثة صالحة للاختبار.', 'NORMAL', ${randomUUID()},
      ${"e".repeat(64)}, '2026-08', now(), now()
    )
    RETURNING id, request_number
  `;
  if (rows[0] === undefined) {
    throw new Error("Integration request insert did not return a row.");
  }
  return { id: rows[0].id, requestNumber: rows[0].request_number };
}

async function createCleanAttachment(
  database: DatabaseClient,
  requestId: string,
  studentUserId: string,
): Promise<string> {
  const attachmentId = randomUUID();
  await database`
    INSERT INTO service_request_attachments (
      id, request_id, uploaded_by_user_id, storage_provider, storage_key,
      original_filename, normalized_extension, detected_mime_type,
      declared_mime_type, size_bytes, sha256, storage_status, scan_status,
      scan_completed_at
    ) VALUES (
      ${attachmentId}, ${requestId}, ${studentUserId}, 'local',
      ${`requests/${requestId}/${attachmentId}/image.jpg`}, 'image.jpg', '.jpg',
      'image/jpeg', 'image/jpeg', 4, ${"f".repeat(64)}, 'STORED', 'CLEAN', now()
    )
  `;
  return attachmentId;
}

integrationDescribe.sequential("administrative request and chat integration", () => {
  let database: DatabaseClient;
  let administrator: UserFixture;
  let student: UserFixture;
  let firstRequest: RequestFixture;
  let secondRequest: RequestFixture;
  let attachmentId: string;
  let foreignAttachmentId: string;
  let serviceId: string;
  let adminRequests: AdminRequestService;
  let chat: ChatService;
  let support: SupportService;

  beforeAll(async () => {
    database = createDatabase(integrationDatabaseUrl!);
    await runMigrations(database, {
      migrationsDirectory: process.env.MIGRATIONS_DIR ?? "migrations",
    });
    await seedDevelopmentCatalog(database, "test");
    const services = await database<{ readonly id: string }[]>`
      SELECT id FROM services WHERE slug = 'document-formatting-review' LIMIT 1
    `;
    if (services[0] === undefined) {
      throw new Error("Expected integration service seed was not found.");
    }
    serviceId = services[0].id;
    administrator = await createUser(database, "ADMIN");
    student = await createUser(database, "STUDENT");
    firstRequest = await createSubmittedRequest(
      database,
      student.principal.userId,
      services[0].id,
      "طلب المحادثة الأول",
    );
    secondRequest = await createSubmittedRequest(
      database,
      student.principal.userId,
      services[0].id,
      "طلب المحادثة الثاني",
    );
    attachmentId = await createCleanAttachment(database, firstRequest.id, student.principal.userId);
    foreignAttachmentId = await createCleanAttachment(
      database,
      secondRequest.id,
      student.principal.userId,
    );
    adminRequests = new AdminRequestService({
      database,
      config: { academicIntegrityVersion: "2026-08" },
    });
    chat = new ChatService({ database });
    support = new SupportService({ database });
  });

  it("creates an idempotent student-owned draft and emits a review event without PII", async () => {
    const submissionKey = randomUUID();
    const created = await adminRequests.createRequestForStudent(
      administrator.principal,
      {
        studentUserId: student.principal.userId,
        serviceId,
        submissionKey,
        title: "مسودة أنشأها المدير للطالب",
        description: "تفاصيل آمنة لمسودة يراجعها الطالب بنفسه قبل الإرسال النهائي.",
        urgency: "NORMAL",
        submitImmediately: false,
      },
      { requestId: "admin-draft-create-test" },
    );
    expect(created).toMatchObject({
      idempotentReplay: false,
      request: { status: "DRAFT" },
    });

    const replay = await adminRequests.createRequestForStudent(administrator.principal, {
      studentUserId: student.principal.userId,
      serviceId,
      submissionKey,
      title: "مسودة أنشأها المدير للطالب",
      description: "تفاصيل آمنة لمسودة يراجعها الطالب بنفسه قبل الإرسال النهائي.",
      urgency: "NORMAL",
      submitImmediately: false,
    });
    expect(replay).toMatchObject({
      idempotentReplay: true,
      request: { id: created.request.id },
    });
    await expect(
      adminRequests.createRequestForStudent(administrator.principal, {
        studentUserId: student.principal.userId,
        serviceId,
        submissionKey,
        title: "عنوان مختلف لنفس المفتاح",
        description: "تفاصيل مختلفة يجب ألا تعيد استعمال مفتاح العملية السابقة.",
        submitImmediately: false,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    await expect(
      adminRequests.createRequestForStudent(administrator.principal, {
        studentUserId: randomUUID(),
        serviceId,
        submissionKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "REQUEST_NOT_FOUND" });

    const persisted = await database<
      {
        readonly student_user_id: string;
        readonly status: string;
        readonly submitted_at: Date | null;
      }[]
    >`
      SELECT student_user_id, status, submitted_at FROM service_requests
      WHERE id = ${created.request.id}
    `;
    expect(persisted[0]).toMatchObject({
      student_user_id: student.principal.userId,
      status: "DRAFT",
      submitted_at: null,
    });
    const outbox = await database<
      { readonly event_type: string; readonly aggregate_type: string; readonly payload: unknown }[]
    >`
      SELECT event_type, aggregate_type, payload FROM outbox_events
      WHERE aggregate_id = ${created.request.id}
      ORDER BY created_at ASC, id ASC
    `;
    expect(outbox.map((row) => row.event_type)).toEqual(["REQUEST_CREATED"]);
    expect(JSON.stringify(outbox)).not.toContain(student.principal.displayName);
    expect(JSON.stringify(outbox)).not.toContain(student.principal.email);
    const audit = await database<{ readonly event_type: string; readonly metadata: unknown }[]>`
      SELECT event_type, metadata FROM security_audit_events
      WHERE request_id = 'admin-draft-create-test'
    `;
    expect(audit).toEqual([expect.objectContaining({ event_type: "request.created_by_admin" })]);
  });

  it("submits an active request immediately and separates its idempotency mode", async () => {
    const submissionKey = randomUUID();
    const input = {
      studentUserId: student.principal.userId,
      serviceId,
      submissionKey,
      title: "طلب فعّال أنشأه المدير",
      description: "أكد الطالب تفاصيل هذا الطلب عبر واتساب وطلب بدء مراجعته مباشرة.",
      urgency: "URGENT" as const,
      submitImmediately: true,
    };
    const created = await adminRequests.createRequestForStudent(administrator.principal, input, {
      requestId: "admin-active-request-test",
    });
    expect(created).toMatchObject({
      idempotentReplay: false,
      request: { status: "SUBMITTED", version: 2 },
    });
    await expect(
      adminRequests.createRequestForStudent(administrator.principal, input),
    ).resolves.toMatchObject({
      idempotentReplay: true,
      request: { id: created.request.id, status: "SUBMITTED", version: 2 },
    });
    await expect(
      adminRequests.createRequestForStudent(administrator.principal, {
        ...input,
        submitImmediately: false,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    await expect(
      adminRequests.createRequestForStudent(administrator.principal, {
        studentUserId: student.principal.userId,
        serviceId,
        submissionKey: randomUUID(),
        title: "",
        description: "",
        submitImmediately: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    const persisted = await database<
      {
        readonly status: string;
        readonly version: number;
        readonly submitted_at: Date | null;
        readonly academic_integrity_version: string | null;
      }[]
    >`
      SELECT status, version, submitted_at, academic_integrity_version
      FROM service_requests WHERE id = ${created.request.id}
    `;
    expect(persisted[0]).toMatchObject({
      status: "SUBMITTED",
      version: 2,
      academic_integrity_version: "2026-08",
    });
    expect(persisted[0]?.submitted_at).toBeInstanceOf(Date);
    const events = await database<
      { readonly event_type: string; readonly request_version: number }[]
    >`
      SELECT event_type, request_version FROM service_request_events
      WHERE request_id = ${created.request.id}
      ORDER BY id ASC
    `;
    expect(events).toEqual([
      { event_type: "REQUEST_CREATED", request_version: 1 },
      { event_type: "REQUEST_SUBMITTED", request_version: 2 },
    ]);
    const outbox = await database<{ readonly event_type: string }[]>`
      SELECT event_type FROM outbox_events
      WHERE aggregate_id = ${created.request.id}
      ORDER BY created_at ASC, id ASC
    `;
    expect(outbox.map((row) => row.event_type)).toEqual(
      expect.arrayContaining(["REQUEST_CREATED", "REQUEST_SUBMITTED", "REQUEST_NEEDS_REVIEW"]),
    );
  });

  it("keeps general support independent, idempotent, and scoped to its student", async () => {
    const conversation = await support.getOrCreateOwnConversation(student.principal, {
      requestId: "support-open-test",
    });
    const reopened = await support.openConversationForStudent(
      administrator.principal,
      student.principal.userId,
    );
    expect(reopened.id).toBe(conversation.id);

    // Migration 019 folds historical request/system events into the student's
    // canonical conversation. Establish a read baseline before asserting the
    // receipt count for the new general-support exchange below.
    await support.markRead(administrator.principal, conversation.id);
    await support.markRead(student.principal, conversation.id);

    const clientMessageId = randomUUID();
    const sent = await support.sendMessage(
      student.principal,
      conversation.id,
      { body: "أحتاج مساعدة عامة في حسابي.", clientMessageId },
      { requestId: "support-send-test" },
    );
    expect(sent).toMatchObject({
      idempotentReplay: false,
      message: { senderType: "STUDENT", status: "SENT" },
    });
    const replay = await support.sendMessage(student.principal, conversation.id, {
      body: "أحتاج مساعدة عامة في حسابي.",
      clientMessageId,
    });
    expect(replay).toMatchObject({ idempotentReplay: true, message: { id: sent.message.id } });
    await expect(
      support.sendMessage(student.principal, conversation.id, {
        body: "رسالة مختلفة",
        clientMessageId,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    const inbox = await support.listConversations(administrator.principal, {
      search: student.principal.displayName,
    });
    expect(inbox.items).toContainEqual(
      expect.objectContaining({ id: conversation.id, unreadCount: 1 }),
    );
    const readByAdmin = await support.markRead(administrator.principal, conversation.id);
    expect(readByAdmin).toMatchObject({ status: "READ", updatedMessageCount: 1 });
    const response = await support.sendMessage(administrator.principal, conversation.id, {
      body: "تم استلام استفسارك وسنساعدك هنا.",
    });
    expect(response.message).toMatchObject({ senderType: "ADMIN", status: "SENT" });
    expect(await support.markRead(student.principal, conversation.id)).toMatchObject({
      status: "READ",
      updatedMessageCount: 1,
    });
    const messages = await support.listMessages(student.principal, conversation.id);
    expect(messages.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sent.message.id, status: "READ" }),
        expect.objectContaining({ id: response.message.id, status: "READ" }),
      ]),
    );

    const otherStudent = await createUser(database, "STUDENT");
    try {
      await expect(
        support.listMessages(otherStudent.principal, conversation.id),
      ).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
      await expect(
        support.sendMessage(otherStudent.principal, conversation.id, {
          body: "محاولة وصول إلى محادثة طالب آخر.",
        }),
      ).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
    } finally {
      await database`
        DELETE FROM support_conversations
        WHERE student_user_id = ${otherStudent.principal.userId}
      `;
      await database`DELETE FROM users WHERE id = ${otherStudent.principal.userId}`;
    }
  });

  it("lists, assigns, and transitions a request with optimistic versions", async () => {
    const initial = await adminRequests.getAdminRequest(
      administrator.principal,
      firstRequest.requestNumber,
    );
    expect(initial.status).toBe("SUBMITTED");
    expect(initial.version).toBe(1);
    expect(initial.assignment).toBeUndefined();

    const assigned = await adminRequests.assignRequest(
      administrator.principal,
      firstRequest.requestNumber,
      { expectedVersion: initial.version, adminUserId: administrator.principal.userId },
    );
    expect(assigned.assignment?.adminUserId).toBe(administrator.principal.userId);
    expect(assigned.version).toBe(2);

    const reviewed = await adminRequests.transitionRequestStatus(
      administrator.principal,
      firstRequest.requestNumber,
      { expectedVersion: assigned.version, toStatus: "UNDER_REVIEW" },
    );
    expect(reviewed.status).toBe("UNDER_REVIEW");
    expect(reviewed.version).toBe(3);

    const edited = await adminRequests.updateRequestDetails(
      administrator.principal,
      firstRequest.requestNumber,
      {
        expectedVersion: reviewed.version,
        title: "عنوان حدّثه المدير بأمان",
        description: "وصف تشغيلي حدّثه المدير مع بقاء صاحب الطلب والخدمة كما هما.",
        deadlineAt: new Date(Date.now() + 7 * 86_400_000),
        urgency: "URGENT",
      },
      { requestId: "admin-request-edit-test" },
    );
    expect(edited.version).toBe(4);
    expect(edited.title).toBe("عنوان حدّثه المدير بأمان");
    expect(edited.urgency).toBe("URGENT");
    const editedDetail = await adminRequests.getAdminRequest(
      administrator.principal,
      firstRequest.requestNumber,
    );
    expect(editedDetail.description).toContain("بقاء صاحب الطلب والخدمة");
    expect(editedDetail.studentUserId).toBe(student.principal.userId);
    const historicalDeadline = new Date(Date.now() - 86_400_000);
    await database`
      UPDATE service_requests
      SET created_at = now() - interval '2 days', deadline_at = ${historicalDeadline}
      WHERE id = ${firstRequest.id}
    `;
    const editedWithHistoricalDeadline = await adminRequests.updateRequestDetails(
      administrator.principal,
      firstRequest.requestNumber,
      {
        expectedVersion: edited.version,
        title: "تعديل عنوان مع موعد تاريخي محفوظ",
        description: editedDetail.description,
        deadlineAt: historicalDeadline,
        urgency: edited.urgency,
      },
    );
    expect(editedWithHistoricalDeadline.version).toBe(5);
    await expect(
      adminRequests.updateRequestDetails(administrator.principal, firstRequest.requestNumber, {
        expectedVersion: reviewed.version,
        title: "محاولة بإصدار قديم",
        description: "يجب أن تفشل هذه المحاولة بسبب تعارض الإصدار المتفائل.",
        urgency: "NORMAL",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    await expect(
      adminRequests.transitionRequestStatus(administrator.principal, firstRequest.requestNumber, {
        expectedVersion: editedWithHistoricalDeadline.version,
        toStatus: "COMPLETED",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    const listed = await adminRequests.listAdminRequests(administrator.principal, {
      assignedAdminUserId: administrator.principal.userId,
      search: firstRequest.requestNumber,
    });
    expect(listed.items.map((item) => item.id)).toContain(firstRequest.id);
    const editAudit = await database<
      { readonly event_type: string; readonly metadata: Record<string, unknown> }[]
    >`
      SELECT event_type, metadata FROM security_audit_events
      WHERE request_id = 'admin-request-edit-test'
    `;
    expect(editAudit).toEqual([
      expect.objectContaining({
        event_type: "request.details_updated_by_admin",
        metadata: expect.objectContaining({
          changedFields: expect.arrayContaining(["title", "description", "deadlineAt", "urgency"]),
          version: 4,
          revision: expect.objectContaining({
            title: expect.objectContaining({
              before: expect.any(String),
              after: "عنوان حدّثه المدير بأمان",
            }),
          }),
        }),
      }),
    ]);
  });

  it("sends idempotent typed messages and rejects cross-request attachments", async () => {
    const clientMessageId = randomUUID();
    const first = await chat.sendChatMessage(student.principal, firstRequest.requestNumber, {
      contentType: "TEXT",
      body: "هذه رسالة الطالب إلى المدير.",
      clientMessageId,
    });
    expect(first.idempotentReplay).toBe(false);
    expect(first.message.status).toBe("SENT");

    const replay = await chat.sendChatMessage(student.principal, firstRequest.requestNumber, {
      contentType: "TEXT",
      body: "هذه رسالة الطالب إلى المدير.",
      clientMessageId,
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.message.id).toBe(first.message.id);

    const image = await chat.sendChatMessage(student.principal, firstRequest.requestNumber, {
      contentType: "IMAGE",
      body: "صورة مرتبطة بالطلب",
      attachmentId,
    });
    expect(image.message.attachment?.mimeType).toBe("image/jpeg");

    await expect(
      chat.sendChatMessage(student.principal, firstRequest.requestNumber, {
        contentType: "FILE",
        attachmentId: foreignAttachmentId,
      }),
    ).rejects.toMatchObject({ code: "INVALID_MESSAGE_ATTACHMENT" });

    const fromAdmin = await chat.sendChatMessage(
      administrator.principal,
      firstRequest.requestNumber,
      { contentType: "TEXT", body: "وصلت رسالتك، جارٍ تنفيذ الطلب." },
    );
    expect(fromAdmin.message.senderType).toBe("ADMIN");
  });

  it("advances receipts monotonically and exposes unread conversation counts", async () => {
    const beforeRead = await chat.listConversations(administrator.principal, {
      search: firstRequest.requestNumber,
    });
    expect(beforeRead.items[0]?.unreadCount).toBeGreaterThan(0);

    const adminRead = await chat.markConversationRead(
      administrator.principal,
      firstRequest.requestNumber,
    );
    expect(adminRead.status).toBe("READ");
    expect(adminRead.updatedMessageCount).toBeGreaterThan(0);

    const studentDelivered = await chat.markConversationDelivered(
      student.principal,
      firstRequest.requestNumber,
    );
    expect(studentDelivered.status).toBe("DELIVERED");
    const studentRead = await chat.markConversationRead(
      student.principal,
      firstRequest.requestNumber,
    );
    expect(studentRead.status).toBe("READ");

    const messages = await chat.listChatMessages(student.principal, firstRequest.requestNumber, {
      pageSize: 50,
    });
    expect(messages.items.some((message) => message.status === "READ")).toBe(true);
    expect(messages.items.map((message) => message.contentType)).toEqual(
      expect.arrayContaining(["ACTION", "SYSTEM", "TEXT", "IMAGE"]),
    );
  });

  afterAll(async () => {
    if (database !== undefined) {
      if (administrator !== undefined) {
        // Migration 018 allows exactly one ADMIN. Drop the role even when a test
        // fails so the next serial integration suite can create its fixture.
        // Keep the identity because append-only request/audit evidence retains it.
        await database`
          DELETE FROM user_roles
          WHERE user_id = ${administrator.principal.userId} AND role_code = 'ADMIN'
        `;
      }
      await closeDatabase(database);
    }
  });
});
