import { expect, test, type Page } from "@playwright/test";

const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

interface MailpitMessage {
  readonly ID?: string;
  readonly id?: string;
  readonly To?: readonly { readonly Address?: string }[];
  readonly to?: readonly { readonly address?: string }[];
}

interface MailpitList {
  readonly messages?: readonly MailpitMessage[];
}

async function actionLink(
  recipient: string,
  action: "verify-email" | "reset-password",
): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`);
    if (response.ok) {
      const body = (await response.json()) as MailpitList;
      const matchingMessages = (body.messages ?? []).filter((message) => {
        const recipients = message.To ?? message.to ?? [];
        return recipients.some(
          (entry) => (entry.Address ?? entry.address)?.toLocaleLowerCase("en-US") === recipient,
        );
      });
      for (const message of matchingMessages) {
        const id = message.ID ?? message.id;
        if (id === undefined) {
          continue;
        }
        const messageResponse = await fetch(
          `${mailpitUrl}/api/v1/message/${encodeURIComponent(id)}`,
        );
        if (!messageResponse.ok) {
          continue;
        }
        const messageBody = (await messageResponse.json()) as {
          readonly Text?: string;
          readonly text?: string;
        };
        const content = messageBody.Text ?? messageBody.text ?? "";
        const match = content.match(
          new RegExp(`https?:\\/\\/[^\\s]+\\/ar\\/auth\\/${action}#token=[^\\s]+`, "u"),
        );
        if (match?.[0] !== undefined) {
          return match[0];
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for the requested local Mailpit action link.");
}

async function openActionLink(
  page: Page,
  recipient: string,
  action: "verify-email" | "reset-password",
): Promise<void> {
  const url = new URL(await actionLink(recipient, action));
  const fragment = url.hash;
  const pathname = url.pathname;
  url.hash = "";
  await page.addInitScript(
    ({ actionPath, actionFragment }) => {
      if (globalThis.location.pathname === actionPath) {
        globalThis.history.replaceState(
          null,
          "",
          `${globalThis.location.pathname}${globalThis.location.search}${actionFragment}`,
        );
      }
    },
    { actionPath: pathname, actionFragment: fragment },
  );
  await page.goto(url.toString());
  await page.waitForFunction(() => {
    const tokenInput = globalThis.document.querySelector<HTMLInputElement>('input[name="token"]');
    return globalThis.location.hash.length === 0 && (tokenInput?.value.length ?? 0) > 0;
  });
}

test("student registration, verification, login, recovery, and session revocation", async ({
  page,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const email = `auth-e2e-${suffix}@example.test`;
  const firstPassword = `Long test passphrase ${suffix}!`;
  const secondPassword = `Replaced test passphrase ${suffix}!`;

  await page.goto("/ar/admin");
  await expect(page).toHaveURL(/\/ar\/auth\/login\?next=%2Far%2Fadmin/u);

  await page.goto("/ar/auth/register");
  await page.getByLabel("الاسم").fill("اختبار المتصفح");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(firstPassword);
  await page.getByLabel("تأكيد كلمة المرور").fill(firstPassword);
  await page.getByLabel(/أوافق على شروط الاستخدام/).check();
  await page.getByLabel(/أوافق على سياسة الخصوصية/).check();
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page).toHaveURL(/\/ar\/auth\/login\?status=account_created/u);

  await openActionLink(page, email, "verify-email");
  await page.getByRole("button", { name: "تأكيد البريد الإلكتروني" }).click();
  await expect(page).toHaveURL(/\/ar\/auth\/login\?status=verified/u);

  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(firstPassword);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/account/u);
  await expect(page.getByRole("heading", { name: "حسابي" })).toBeVisible();

  const forbiddenResponse = await page.goto("/ar/admin");
  expect(forbiddenResponse?.status()).toBe(403);
  await expect(page.getByRole("heading", { name: /403 — الوصول غير مسموح/u })).toBeVisible();
  await page.goto("/ar/account");
  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page).toHaveURL(/\/ar\/auth\/login\?status=logged_out/u);

  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(firstPassword);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/account/u);

  await page.goto("/ar/auth/forgot-password");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByRole("button", { name: "إرسال تعليمات الاستعادة" }).click();
  await expect(page).toHaveURL(/status=sent/u);

  await openActionLink(page, email, "reset-password");
  await page.getByLabel("كلمة المرور الجديدة", { exact: true }).fill(secondPassword);
  await page.getByLabel("تأكيد كلمة المرور الجديدة").fill(secondPassword);
  await page.getByRole("button", { name: "حفظ كلمة المرور الجديدة" }).click();
  await expect(page).toHaveURL(/\/ar\/auth\/login\?status=password_reset/u);

  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(secondPassword);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/account/u);
  await page.goto("/ar/account/sessions");
  await page.getByRole("button", { name: "تسجيل الخروج من جميع الأجهزة" }).click();
  await expect(page).toHaveURL(/\/ar\/auth\/login\?status=logged_out/u);
});
