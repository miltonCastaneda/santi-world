import { expect, test } from "@playwright/test";

test("[plataforma-escalable] Producción: la API de pruebas no existe ni se activa con ?test=1, y no está en el bundle", async ({ page, request }) => {
  await page.goto("/?test=1");
  await expect(page.locator("canvas#game")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => typeof window.__santi)).toBe("undefined");

  const html = await (await request.get("/")).text();
  const scripts = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const src of scripts) expect(await (await request.get(src)).text(), src).not.toContain("__santi");
});
