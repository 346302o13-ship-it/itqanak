import { expect, test } from "@playwright/test";

test("Arabic landing page is reachable and RTL", async ({ page }) => {
  await page.goto("/ar");
  await expect(page).toHaveTitle(/إتقانك/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: /نعيد بناء تجربة تعليمية/ })).toBeVisible();
});

test("unknown route uses a safe not-found page", async ({ page }) => {
  const response = await page.goto("/ar/not-a-real-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeVisible();
});
