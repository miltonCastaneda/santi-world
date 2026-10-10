import { expect, test } from "@playwright/test";

test("[vista-de-padres] Acceso directo por URL (producción): /padres redirige y la vista aparece en 2 s o menos", async ({ page }) => {
  const start = Date.now();
  await page.goto("/padres");
  await expect(page.locator("#parents-root[data-ready='true']")).toBeVisible();
  expect(Date.now() - start).toBeLessThanOrEqual(2000);
  await expect(page).toHaveURL(/\/padres\/$/);
  await expect(page.locator("h1")).toHaveText("Vista de padres");
  expect(await page.evaluate(() => typeof window.__padres)).toBe("undefined");
});

test("[vista-de-padres] Sin enlaces desde la UI del niño: el bundle del juego no contiene la vista de padres", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const scripts = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const src of scripts) {
    const code = await (await request.get(src)).text();
    expect(code, src).not.toMatch(/Vista de padres|\/padres/);
  }
});
