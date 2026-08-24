import { expect, test, type Page } from "@playwright/test";

import {
  activatePhoneFixture,
  assertIsolatedPhoneE2eEnvironment,
  bootstrapPhoneAdmin,
  uniquePhone,
  type SupportedPhoneCountry,
} from "../e2e-support/isolated-phone-fixture";

const baseUrl = process.env.REQUESTS_E2E_BASE_URL ?? "http://127.0.0.1:8080";

async function registerVerifyAndLogin(
  page: Page,
  country: SupportedPhoneCountry,
  localPhone: string,
  phoneE164: string,
  password: string,
  displayName: string,
): Promise<void> {
  await page.goto("/ar/auth/register");
  await page.getByLabel("الاسم").fill(displayName);
  await page
    .getByLabel("البريد الإلكتروني")
    .fill(`student-${phoneE164.replace(/[^0-9]/gu, "")}@example.test`);
  await page.getByLabel("الدولة").selectOption(country);
  await page.getByLabel("رقم الجوال").fill(localPhone);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByLabel("تأكيد كلمة المرور").fill(password);
  await page.getByLabel(/أوافق على شروط الاستخدام/u).check();
  await page.getByLabel(/أوافق على سياسة الخصوصية/u).check();
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page).toHaveURL(/\/ar\/auth\/pending-phone-verification\?status=account_created/u);
  await activatePhoneFixture(phoneE164);

  await page.goto("/ar/auth/login");
  await page.getByLabel("رقم الجوال بصيغة دولية أو البريد الإلكتروني").fill(phoneE164);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/account/u);
}

async function loginAdmin(page: Page, phoneE164: string, password: string): Promise<void> {
  await page.goto("/ar/auth/login?next=%2Far%2Fadmin%2Fsupport");
  await page.getByLabel("رقم الجوال بصيغة دولية أو البريد الإلكتروني").fill(phoneE164);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin\/support$/u);
}

test.beforeAll(async () => {
  await assertIsolatedPhoneE2eEnvironment(baseUrl);
});

test("unified AR/EN conversation covers request updates, notifications, files, and quote approval", async ({
  browser,
  page,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const ownerPhone = uniquePhone("SA");
  const otherPhone = uniquePhone("KW");
  const adminPhone = uniquePhone("AE");
  const password = `Long test passphrase ${suffix}!`;
  const adminPassword = `Admin request passphrase ${suffix}!`;
  const finalTitle = `مراجعة تنسيق تجريبية ${suffix}`;
  const studentMessage = `رسالة الطالب الخاصة بالطلب ${suffix}`;
  const adminMessage = `تم استلام التفاصيل وسنبدأ المراجعة ${suffix}`;
  const englishStudentMessage = `English follow-up from the student ${suffix}`;
  const englishAdminMessage = `English confirmation from support ${suffix}`;
  const ownerEmail = `student-${ownerPhone.e164.replace(/[^0-9]/gu, "")}@example.test`;
  const quoteDescriptionAr = `عرض المراجعة والتنسيق ${suffix}`;
  const quoteDescriptionEn = `Review and formatting quote ${suffix}`;

  await registerVerifyAndLogin(
    page,
    ownerPhone.country,
    ownerPhone.local,
    ownerPhone.e164,
    password,
    "طالب اختبار الطلبات",
  );

  await page.goto("/ar/services");
  await expect(page.getByText(/\b(?:SAR|AED|KWD)\b/u)).toHaveCount(0);
  await expect(page.getByText(/\d+(?:[.,]\d+)?\s*(?:ر\.?\s?س|درهم|دينار)/u)).toHaveCount(0);
  const serviceHeading = page.getByRole("heading", { name: "ترجمة المستندات" });
  await expect(serviceHeading).toBeVisible();
  await serviceHeading.locator("..").getByRole("link", { name: "تفاصيل الخدمة" }).click();
  await expect(page.getByRole("heading", { name: "ترجمة المستندات" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "دعم مشروع ومسؤول" })).toBeVisible();
  await page.getByRole("link", { name: "اطلب الخدمة" }).click();

  await expect(page).toHaveURL(/\/ar\/student\/requests\/new\?service=document-translation/u);
  await expect(page.getByRole("heading", { name: "إنشاء طلب جديد" })).toBeVisible();
  await expect(page.getByLabel("الخدمة").locator("option:checked")).toContainText(
    "ترجمة المستندات",
  );
  await page.getByLabel("عنوان الطلب").fill(`مسودة طلب ${suffix}`);
  await page
    .getByLabel("وصف الطلب")
    .fill("مسودة أولية لاختبار دورة الطلب قبل تحرير تفاصيلها النهائية.");
  await page.getByRole("button", { name: "حفظ كمسودة" }).click();
  await expect(page.getByRole("status")).toContainText("تم إنشاء المسودة");

  const createdUrl = new URL(page.url());
  const requestMatch = createdUrl.pathname.match(
    /^\/ar\/student\/requests\/(ITQ-[0-9]{4}-[0-9]{6,})$/u,
  );
  expect(requestMatch).not.toBeNull();
  const requestNumber = requestMatch?.[1];
  if (requestNumber === undefined) {
    throw new Error("The created request URL did not contain a request number.");
  }
  const requestPath = `/ar/student/requests/${requestNumber}`;

  await page.getByLabel("عنوان الطلب").fill(finalTitle);
  await page
    .getByLabel("وصف الطلب")
    .fill("مراجعة تنسيق مستند أعددته مسبقاً مع توضيح الملاحظات التعليمية اللازمة.");
  await page.getByLabel("درجة الاستعجال").selectOption("URGENT");
  await page.getByLabel("اللغة الاختيارية").selectOption("ar");
  await expect(page.getByLabel(/الميزانية|العملة/u)).toHaveCount(0);
  await page.getByLabel("المستوى الدراسي الاختياري").selectOption("BACHELOR");
  await page.getByLabel("المؤسسة أو الجامعة").fill("جامعة الاختبار");
  await page.getByLabel(/أطلب التعامل مع تفاصيل هذا الطلب بخصوصية إضافية/u).check();
  await page.getByRole("button", { name: "حفظ التعديلات" }).click();
  await expect(page).toHaveURL((url) => {
    return url.pathname === requestPath && url.searchParams.get("status") === "saved";
  });
  await expect(page.getByRole("status")).toHaveText("تم حفظ التعديلات.");

  const submitVersion = page.locator('form[action$="/submit"] input[name="version"]');
  const versionBeforeUpload = Number(await submitVersion.inputValue());
  await page.getByLabel("إضافة ملف واحد").setInputFiles({
    name: "phase3-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("ITQANAK phase three browser test attachment.\n", "utf8"),
  });
  await page.getByRole("button", { name: "رفع الملف" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "تم رفع الملف وحفظه في التخزين الخاص." }),
  ).toHaveText("تم رفع الملف وحفظه في التخزين الخاص.", { timeout: 60_000 });
  await expect(page.getByText("phase3-note.txt", { exact: true })).toBeVisible();
  await expect(page.getByText(/لم يُفحص/u).first()).toBeVisible();
  await expect
    .poll(async () => Number(await submitVersion.inputValue()))
    .toBeGreaterThan(versionBeforeUpload);

  await page.getByLabel(/أقر بأن الطلب ملتزم بسياسة النزاهة الأكاديمية الحالية/u).check();
  await page.getByRole("button", { name: "إرسال الطلب الآن" }).click();
  await expect(page).toHaveURL((url) => {
    return url.pathname === requestPath && url.searchParams.get("status") === "submitted";
  });
  await expect(page.getByRole("status")).toHaveText("تم إرسال الطلب بنجاح.");
  await expect(page.getByText("مُرسل", { exact: true })).toBeVisible();
  await expect(page.getByText(requestNumber, { exact: true })).toBeVisible();

  const timeline = page.getByRole("list", { name: "سجل تحديثات الطلب" });
  await expect(timeline.getByText("تم إنشاء الطلب", { exact: true })).toBeVisible();
  await expect(timeline.getByText("تم تحديث الطلب", { exact: true })).toBeVisible();
  await expect(timeline.getByText("تمت إضافة ملف", { exact: true })).toBeVisible();
  await expect(timeline.getByText("تم إرسال الطلب", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "فتح المحادثة" }).click();
  await expect(page).toHaveURL(/\/ar\/student\/support\?request=[0-9a-f-]+$/u);
  const requestId = new URL(page.url()).searchParams.get("request");
  expect(requestId).not.toBeNull();
  if (requestId === null) {
    throw new Error("The unified conversation URL did not contain the linked request id.");
  }

  const studentConversation = page.getByRole("region", { name: "المحادثة الموحدة" });
  await expect(studentConversation.getByRole("heading", { name: "دعم إتقانك" })).toBeVisible();
  await expect(studentConversation.getByText(finalTitle, { exact: true }).first()).toBeVisible();
  await expect(studentConversation.getByText(requestNumber, { exact: true }).first()).toBeVisible();
  await expect(
    studentConversation.getByRole("button", { name: "إرفاق صورة أو ملف" }),
  ).toBeVisible();
  await expect(
    studentConversation.getByRole("button", { name: "تسجيل رسالة صوتية" }),
  ).toBeVisible();
  const studentLog = studentConversation.getByRole("log", { name: "رسائل المحادثة" });
  await expect(studentLog.getByText("تم إنشاء الطلب", { exact: true })).toBeVisible();
  await expect(studentLog.getByText("تم تحديث تفاصيل الطلب", { exact: true })).toBeVisible();
  await expect(studentLog.getByText("تم إرسال الطلب إلى الإدارة", { exact: true })).toBeVisible();

  await studentConversation.locator('input[type="file"]').setInputFiles({
    name: "unified-chat-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Private file sent through the unified conversation.\n", "utf8"),
  });
  await expect(studentConversation.getByRole("status")).toContainText("تم الإرسال دون فحص", {
    timeout: 60_000,
  });
  await expect(studentLog.getByText("unified-chat-note.txt", { exact: true })).toBeVisible();
  await expect(studentLog.getByText(/افتحه فقط إذا كنت تثق بالمرسل/u)).toBeVisible();

  await studentConversation.getByLabel("الرسالة").fill(studentMessage);
  await studentConversation.getByRole("button", { name: "إرسال الرسالة" }).click();
  await expect(studentLog.getByText(studentMessage, { exact: true })).toBeVisible();
  await expect(studentConversation.getByTitle("أُرسلت").last()).toBeVisible();

  await page.goto("/ar/student");
  await expect(page.getByRole("heading", { name: "أهلاً، طالب اختبار الطلبات" })).toBeVisible();
  await expect(page.getByText(finalTitle, { exact: true })).toBeVisible();
  await page.goto("/ar/student/requests");
  await page.getByLabel("رقم الطلب أو العنوان").fill(finalTitle);
  await page.getByRole("button", { name: "تطبيق" }).click();
  await expect(page.getByText(finalTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(requestNumber, { exact: true })).toBeVisible();
  await expect(page.getByText(/1 طلب — الصفحة 1 من 1/u)).toBeVisible();

  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await registerVerifyAndLogin(
      otherPage,
      otherPhone.country,
      otherPhone.local,
      otherPhone.e164,
      password,
      "طالب اختبار آخر",
    );
    const foreignResponse = await otherPage.goto(requestPath);
    expect(foreignResponse?.status()).toBe(404);
    await expect(otherPage.getByRole("heading", { name: "الطلب غير موجود" })).toBeVisible();
  } finally {
    await otherContext.close();
  }

  const adminContext = await browser.newContext();
  try {
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/ar/auth/register");
    await adminPage.getByLabel("الاسم").fill("مدير محادثات الاختبار");
    await adminPage
      .getByLabel("البريد الإلكتروني")
      .fill(`admin-${adminPhone.e164.replace(/[^0-9]/gu, "")}@example.test`);
    await adminPage.getByLabel("الدولة").selectOption(adminPhone.country);
    await adminPage.getByLabel("رقم الجوال").fill(adminPhone.local);
    await adminPage.getByLabel("كلمة المرور", { exact: true }).fill(adminPassword);
    await adminPage.getByLabel("تأكيد كلمة المرور").fill(adminPassword);
    await adminPage.getByLabel(/أوافق على شروط الاستخدام/u).check();
    await adminPage.getByLabel(/أوافق على سياسة الخصوصية/u).check();
    await adminPage.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(adminPage).toHaveURL(
      /\/ar\/auth\/pending-phone-verification\?status=account_created/u,
    );
    await bootstrapPhoneAdmin(adminPhone.e164);
    await loginAdmin(adminPage, adminPhone.e164, adminPassword);

    await adminPage.goto(`/ar/admin/support?q=${encodeURIComponent(ownerPhone.e164)}`);
    await expect(adminPage.getByLabel("البحث عن طالب")).toHaveValue(ownerPhone.e164);
    const contact = adminPage.getByRole("listitem").filter({ hasText: "طالب اختبار الطلبات" });
    await expect(contact).toContainText(ownerPhone.e164);
    await expect(contact).toContainText(ownerEmail);

    const adminConversation = adminPage.getByRole("region", { name: "المحادثة الموحدة" });
    const adminLog = adminConversation.getByRole("log", { name: "رسائل المحادثة" });
    await expect(
      adminConversation.getByRole("heading", { name: "طالب اختبار الطلبات" }),
    ).toBeVisible();
    await expect(adminLog.getByText(studentMessage, { exact: true })).toBeVisible();
    await expect(adminLog.getByText("unified-chat-note.txt", { exact: true })).toBeVisible();

    await adminConversation.getByRole("button").filter({ hasText: finalTitle }).click();
    await expect(adminConversation.getByText(`مرتبطة بالطلب ${requestNumber}`)).toBeVisible();
    await adminConversation.getByLabel("الرسالة").fill(adminMessage);
    await adminConversation.getByRole("button", { name: "إرسال الرسالة" }).click();
    await expect(adminLog.getByText(adminMessage, { exact: true })).toBeVisible();
    await expect(adminConversation.getByTitle("أُرسلت").last()).toBeVisible();

    await page.goto("/ar/student");
    await page.reload();
    const arabicNotifications = page.getByRole("button", { name: "الإشعارات" });
    await expect(arabicNotifications).toContainText(/[1-9]/u);
    await arabicNotifications.click();
    const arabicNotificationCenter = page.getByRole("dialog", { name: "مركز الإشعارات" });
    await expect(arabicNotificationCenter.getByText("رسالة جديدة", { exact: true })).toBeVisible();
    const soundToggle = arabicNotificationCenter.getByRole("button", { name: "تفعيل الصوت" });
    await expect(soundToggle).toHaveAttribute("aria-pressed", "false");
    await soundToggle.click();
    await expect(
      arabicNotificationCenter.getByRole("button", { name: "الصوت مفعّل" }),
    ).toHaveAttribute("aria-pressed", "true");
    await arabicNotificationCenter.getByRole("link").filter({ hasText: "رسالة جديدة" }).click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === "/ar/student/support" &&
        url.searchParams.has("conversation") &&
        url.searchParams.get("request") === requestId
      );
    });
    await expect(studentLog.getByText(adminMessage, { exact: true })).toBeVisible();

    await expect(
      adminLog.getByText(adminMessage).locator("xpath=ancestor::article[1]").getByTitle("قُرئت"),
    ).toBeVisible({ timeout: 15_000 });

    await adminConversation.getByLabel("حالة الطلب الجديدة").selectOption("UNDER_REVIEW");
    await adminConversation.getByRole("button", { name: "حفظ" }).click();
    await expect(adminConversation.getByRole("status")).toHaveText("تم تحديث حالة الطلب.");
    await expect(adminLog.getByText("حالة الطلب: قيد المراجعة", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(studentLog.getByText("حالة الطلب: قيد المراجعة", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/en/student");
    await expect(page.getByRole("heading", { name: "Welcome, طالب اختبار الطلبات" })).toBeVisible();

    await adminConversation.getByText("إرسال عرض سعر", { exact: true }).click();
    await adminConversation.getByLabel("المبلغ").fill("149.50");
    await adminConversation.getByLabel("العملة").selectOption("SAR");
    await adminConversation.getByLabel("الوصف بالعربية").fill(quoteDescriptionAr);
    await adminConversation.getByLabel("Description in English").fill(quoteDescriptionEn);
    await adminConversation
      .getByLabel("صالح حتى")
      .fill(new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 16));
    await adminConversation.getByRole("button", { name: "إرسال العرض" }).click();
    await expect(adminConversation.getByRole("status")).toHaveText(
      "تم إرسال عرض السعر إلى الطالب.",
    );
    await expect(adminLog.getByText(quoteDescriptionAr, { exact: true })).toBeVisible();

    await page.reload();
    const englishNotifications = page.getByRole("button", { name: "Notifications" });
    await expect(englishNotifications).toContainText(/[1-9]/u);
    await englishNotifications.click();
    const englishNotificationCenter = page.getByRole("dialog", { name: "Notification center" });
    await expect(
      englishNotificationCenter.getByRole("button", { name: "Sound on" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(englishNotificationCenter.getByText("New quote", { exact: true })).toBeVisible();
    await englishNotificationCenter.getByRole("link").filter({ hasText: "New quote" }).click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === "/en/student/support" &&
        url.searchParams.has("conversation") &&
        url.searchParams.get("request") === requestId
      );
    });

    const englishStudentConversation = page.getByRole("region", { name: "Unified conversation" });
    const englishStudentLog = englishStudentConversation.getByRole("log", {
      name: "Conversation messages",
    });
    await expect(
      englishStudentConversation.getByRole("heading", { name: "ITQANAK support" }),
    ).toBeVisible();
    await expect(
      englishStudentConversation.getByRole("button", { name: "Attach an image or file" }),
    ).toBeVisible();
    await expect(
      englishStudentConversation.getByRole("button", { name: "Record a voice message" }),
    ).toBeVisible();
    await expect(englishStudentLog.getByText("Request created", { exact: true })).toBeVisible();
    await expect(
      englishStudentLog.getByText("Request submitted to the team", { exact: true }),
    ).toBeVisible();
    await expect(englishStudentLog.getByText(quoteDescriptionEn, { exact: true })).toBeVisible();
    await expect(
      englishStudentConversation.getByText("Price quote", { exact: true }),
    ).toBeVisible();
    await englishStudentConversation.getByRole("button", { name: "Accept quote" }).click();
    await expect(englishStudentConversation.getByRole("status")).toHaveText(
      "Quote accepted. The team has been notified.",
    );
    await expect(
      englishStudentConversation.getByText("Accepted", { exact: true }).first(),
    ).toBeVisible();

    await englishStudentConversation.getByLabel("Message").fill(englishStudentMessage);
    await englishStudentConversation.getByRole("button", { name: "Send message" }).click();
    await expect(englishStudentLog.getByText(englishStudentMessage, { exact: true })).toBeVisible();
    await expect(englishStudentConversation.getByTitle("Sent").last()).toBeVisible();

    await adminPage.goto(`/en/admin/support?q=${encodeURIComponent(ownerPhone.e164)}`);
    await expect(adminPage.getByLabel("Search students")).toHaveValue(ownerPhone.e164);
    const englishContact = adminPage
      .getByRole("listitem")
      .filter({ hasText: "طالب اختبار الطلبات" });
    await expect(englishContact).toContainText(ownerPhone.e164);
    await expect(englishContact).toContainText(ownerEmail);

    const englishAdminConversation = adminPage.getByRole("region", {
      name: "Unified conversation",
    });
    const englishAdminLog = englishAdminConversation.getByRole("log", {
      name: "Conversation messages",
    });
    await expect(englishAdminConversation.getByRole("heading", { name: "Requests" })).toBeVisible();
    await expect(englishAdminLog.getByText(englishStudentMessage, { exact: true })).toBeVisible();
    await expect(englishAdminLog.getByText(quoteDescriptionEn, { exact: true })).toBeVisible();
    await expect(
      englishAdminConversation.getByText("Accepted", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      englishAdminLog
        .getByText("unified-chat-note.txt", { exact: true })
        .locator("xpath=ancestor::div[1]")
        .getByText(
          "Malware scanning was disabled when this file was uploaded. Open it only if you trust the sender.",
          { exact: true },
        ),
    ).toBeVisible();

    await expect(
      englishStudentLog
        .getByText(englishStudentMessage)
        .locator("xpath=ancestor::article[1]")
        .getByTitle("Read"),
    ).toBeVisible({ timeout: 15_000 });

    await englishAdminConversation.getByLabel("Message").fill(englishAdminMessage);
    await englishAdminConversation.getByRole("button", { name: "Send message" }).click();
    await expect(englishAdminLog.getByText(englishAdminMessage, { exact: true })).toBeVisible();
    await expect(englishStudentLog.getByText(englishAdminMessage, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      englishAdminLog
        .getByText(englishAdminMessage)
        .locator("xpath=ancestor::article[1]")
        .getByTitle("Read"),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await adminContext.close();
  }

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/en\/auth\/login\?status=logged_out/u);
});
