import { expect, test } from "@playwright/test";

test("[plataforma-escalable] la API de pruebas no existe en producción", async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page.locator("canvas#game")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => typeof window.__santi)).toBe("undefined");
});
