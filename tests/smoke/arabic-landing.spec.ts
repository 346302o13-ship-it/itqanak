import { expect, test } from "@playwright/test";

test("Arabic landing page is reachable, RTL, price-free, and uses the support WhatsApp", async ({
  page,
}) => {
  await page.goto("/ar");
  await expect(page).toHaveTitle(/إتقانك/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: /دعم تعليمي منظّم/u })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\b(?:SAR|AED|KWD)\b/u);
  await expect(page.locator("body")).not.toContainText(
    /\d+(?:[.,]\d+)?\s*(?:ر\.?\s?س|درهم|دينار)/u,
  );
  await expect(page.getByRole("link", { name: /واتساب/u }).first()).toHaveAttribute(
    "href",
    /wa\.me\/966564202263/u,
  );
});

test("English landing page is a complete LTR counterpart", async ({ page }) => {
  await page.goto("/en");
  await expect(page).toHaveTitle(/ITQANAK/u);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: /Educational support,/u })).toBeVisible();
  await expect(page.getByRole("link", { name: "التبديل إلى العربية" }).first()).toHaveAttribute(
    "href",
    "/ar",
  );
  await expect(page.locator("body")).not.toContainText(/\b(?:SAR|AED|KWD)\b/u);
});

test("unauthenticated admin route redirects to the admin login boundary", async ({ request }) => {
  const response = await request.get("/ar/admin", { maxRedirects: 0 });
  expect([307, 308]).toContain(response.status());
  const location = response.headers()["location"];
  expect(location).toBeDefined();
  const destination = new URL(location ?? "", "http://127.0.0.1:3101");
  expect(destination.pathname).toBe("/ar/auth/login");
  expect(destination.searchParams.get("next")).toBe("/ar/admin");
});

test("unknown route uses a safe not-found page", async ({ page }) => {
  const response = await page.goto("/ar/not-a-real-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeVisible();
});
