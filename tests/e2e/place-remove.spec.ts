import { expect, test, type Page } from "@playwright/test";
import { collectErrors } from "./helpers/page";

async function openTestGame(page: Page): Promise<void> {
  await page.goto("/?test=1");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__santi?.ready === true);
}

async function clickCenter(page: Page, button: "left" | "right" = "left"): Promise<void> {
  const box = await page.locator("canvas#game").boundingBox();
  if (!box) throw new Error("canvas sin tamaño");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button });
}

async function waitForCountChange(page: Page, before: number): Promise<number> {
  await page.waitForFunction((b) => window.__santi!.blockCount() !== b, before);
  return page.evaluate(() => window.__santi!.blockCount());
}

test("[personaje-y-herramientas] poner y quitar bloques con el puntero", async ({ page }) => {
  const errors = collectErrors(page);
  await openTestGame(page);

  const initial = await page.evaluate(() => window.__santi!.blockCount());
  await clickCenter(page);
  const afterPlace = await waitForCountChange(page, initial);
  expect(afterPlace).toBe(initial + 1);

  await clickCenter(page, "right");
  const afterRemove = await waitForCountChange(page, afterPlace);
  expect(afterRemove).toBe(initial);

  await page.getByRole("button", { name: "Deshacer" }).click();
  expect(await waitForCountChange(page, afterRemove)).toBe(initial + 1);

  expect(errors).toEqual([]);
});

test("[plataforma-escalable] la simulación avanza a 20 Hz", async ({ page }) => {
  await openTestGame(page);
  const t0 = await page.evaluate(() => window.__santi!.tick());
  await page.waitForTimeout(1000);
  const t1 = await page.evaluate(() => window.__santi!.tick());
  expect(t1 - t0).toBeGreaterThan(5);
  expect(t1 - t0).toBeLessThanOrEqual(25);
});
