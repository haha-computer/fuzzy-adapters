import { test, expect } from "@playwright/test";

test("page loads without JS errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");

  // Canvas is present and visible
  await expect(page.locator("canvas#c")).toBeVisible();

  // Two status dots are created (one per stream)
  await expect(page.locator(".status")).toHaveCount(2);

  // Both start as disconnected (no boards in CI)
  await expect(page.locator(".status.disconnected")).toHaveCount(2);

  // No uncaught JS errors
  expect(errors).toHaveLength(0);
});
