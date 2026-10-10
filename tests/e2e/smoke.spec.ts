import { expect, test } from "@playwright/test";
import { collectErrors, countCanvasColors } from "./helpers/page";

test("[rendimiento-y-estabilidad-visual] smoke: el juego carga sin errores y dibuja el mundo", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.locator("canvas#game")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await countCanvasColors(page, "canvas#game")).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
