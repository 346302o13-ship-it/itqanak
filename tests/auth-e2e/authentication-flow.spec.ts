import { expect, test, type Page } from "@playwright/test";

import {
  assertIsolatedPhoneE2eEnvironment,
  bootstrapPhoneAdmin,
  phoneVerificationRecord,
  uniquePhone,
  type SupportedPhoneCountry,
} from "../e2e-support/isolated-phone-fixture";

const baseUrl = process.env.AUTH_E2E_BASE_URL ?? "http://127.0.0.1:8080";

interface RegistrationInput {
  readonly country: SupportedPhoneCountry;
  readonly displayName: string;
  readonly email: string;
  readonly localPhone: string;
  readonly password: string;
}

async function registerArabic(page: Page, input: RegistrationInput): Promise<void> {
  await page.goto("/ar/auth/register");
  await page.getByLabel("الاسم").fill(input.displayName);
  await page.getByLabel("البريد الإلكتروني").fill(input.email);
  await page.getByLabel("الدولة").selectOption(input.country);
  await page.getByLabel("رقم الجوال").fill(input.localPhone);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(input.password);
  await page.getByLabel("تأكيد كلمة المرور").fill(input.password);
  await page.getByLabel(/أوافق على شروط الاستخدام/u).check();
  await page.getByLabel(/أوافق على سياسة الخصوصية/u).check();
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page).toHaveURL(/\/ar\/auth\/pending-phone-verification\?status=account_created/u);
  await expect(page.getByRole("heading", { name: "بقي تأكيد رقم الجوال" })).toBeVisible();
  await expect(page.getByRole("link", { name: "مراسلة الدعم عبر واتساب" })).toHaveAttribute(
    "href",
    /wa\.me\/966564202263/u,
  );
}

async function loginArabic(
  page: Page,
  identity: string,
  password: string,
  next?: string,
): Promise<void> {
  const suffix = next === undefined ? "" : `?next=${encodeURIComponent(next)}`;
  await page.goto(`/ar/auth/login${suffix}`);
  await page.getByLabel("رقم الجوال بصيغة دولية أو البريد الإلكتروني").fill(identity);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await assertIsolatedPhoneE2eEnvironment(baseUrl);
});

test("phone-first registration requires audited WhatsApp verification by an administrator", async ({
  browser,
  page,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const adminPhone = uniquePhone("SA");
  const studentPhone = uniquePhone("AE");
  const adminPassword = `Admin browser passphrase ${suffix}!`;
  const studentPassword = `Student browser passphrase ${suffix}!`;
  const studentName = `طالب تحقق ${suffix}`;

  await page.goto("/ar/admin");
  await expect(page).toHaveURL(/\/ar\/auth\/login\?next=%2Far%2Fadmin/u);

  await registerArabic(page, {
    country: adminPhone.country,
    displayName: "مدير اختبار المتصفح",
    email: `admin-${suffix}@example.test`,
    localPhone: adminPhone.local,
    password: adminPassword,
  });

  await loginArabic(page, adminPhone.e164, adminPassword);
  await expect(page).toHaveURL(/\/ar\/auth\/login\?.*status=pending_verification/u);
  await expect(page.getByRole("status")).toContainText("بانتظار تأكيد رقم الجوال");

  // This is the only direct bootstrap. It is guarded by the dedicated E2E
  // Compose project check; all subsequent student verification uses the UI.
  await bootstrapPhoneAdmin(adminPhone.e164);
  await loginArabic(page, adminPhone.e164, adminPassword, "/ar/admin/verifications");
  await expect(page).toHaveURL(/\/ar\/admin\/verifications$/u);
  await expect(page.getByRole("heading", { name: "توثيق أرقام واتساب" })).toBeVisible();

  const studentContext = await browser.newContext();
  try {
    const studentPage = await studentContext.newPage();
    await registerArabic(studentPage, {
      country: studentPhone.country,
      displayName: studentName,
      email: `student-${suffix}@example.test`,
      localPhone: studentPhone.local,
      password: studentPassword,
    });

    await page.reload();
    const verificationCard = page.locator("article").filter({ hasText: studentName });
    await expect(verificationCard).toContainText(studentPhone.e164);
    await verificationCard.getByLabel("مرجع محادثة واتساب *").fill(`WA-E2E-${suffix}`);
    await verificationCard
      .getByLabel("ملاحظة المراجعة")
      .fill("وصلت رسالة اختبار من الرقم نفسه داخل بيئة E2E المعزولة.");
    await verificationCard.getByLabel(/أقر أن الرسالة وصلت من الرقم المعروض نفسه/u).check();
    await verificationCard.getByRole("button", { name: "تأكيد الرقم وتفعيل الحساب" }).click();
    await expect(page).toHaveURL(/\/ar\/admin\/verifications\?notice=verified/u);
    await expect(page.getByRole("status")).toHaveText(
      "تم توثيق الرقم وتفعيل الحساب مع حفظ سجل التدقيق.",
    );

    await expect
      .poll(() => phoneVerificationRecord(studentPhone.e164))
      .toMatchObject({
        status: "VERIFIED",
        accountStatus: "ACTIVE",
        reference: `WA-E2E-${suffix}`,
        confirmationAuditCount: 1,
      });

    await loginArabic(studentPage, studentPhone.e164, studentPassword);
    await expect(studentPage).toHaveURL(/\/ar\/account$/u);
    await expect(studentPage.getByRole("heading", { name: "حسابي" })).toBeVisible();
    await expect(studentPage.getByText("الجوال مؤكّد", { exact: true })).toBeVisible();

    const forbiddenResponse = await studentPage.goto("/ar/admin");
    expect(forbiddenResponse?.status()).toBe(403);
    await expect(
      studentPage.getByRole("heading", { name: /403 — الوصول غير مسموح/u }),
    ).toBeVisible();

    await studentPage.goto("/ar/account/sessions");
    await studentPage.getByRole("button", { name: "تسجيل الخروج من جميع الأجهزة" }).click();
    await expect(studentPage).toHaveURL(/\/ar\/auth\/login\?status=logged_out/u);
  } finally {
    await studentContext.close();
  }
});

test("English registration accepts a Kuwait mobile and exposes all supported countries", async ({
  page,
}) => {
  const phone = uniquePhone("KW");
  const password = `Kuwait browser passphrase ${Date.now()}!`;

  await page.goto("/en/auth/register");
  await expect(page.locator("main")).toHaveAttribute("lang", "en");
  await expect(page.locator("main")).toHaveAttribute("dir", "ltr");
  await expect(page.getByLabel("Country").locator("option")).toHaveText([
    "Saudi Arabia (+966)",
    "United Arab Emirates (+971)",
    "Kuwait (+965)",
  ]);
  await page.getByLabel("Name").fill("Kuwait browser student");
  await page.getByLabel("Email address").fill(`kuwait-${Date.now()}@example.test`);
  await page.getByLabel("Country").selectOption(phone.country);
  await page.getByLabel("Mobile number").fill(phone.local);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel(/I accept the Terms of Use/u).check();
  await page.getByLabel(/I accept the Privacy Policy/u).check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/en\/auth\/pending-phone-verification\?status=account_created/u);
  await expect(page.getByRole("heading", { name: "Verify your mobile number" })).toBeVisible();
  await expect(page.getByText("+966564202263", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact support on WhatsApp" })).toHaveAttribute(
    "href",
    /wa\.me\/966564202263/u,
  );
});
