import { chromium, expect, test, type BrowserContext, type TestInfo } from "@playwright/test";
import { waitWorldReady } from "./helpers/game";

/**
 * Un perfil de Chromium en disco: cerrar el contexto es cerrar el navegador y lanzarlo de nuevo con
 * el mismo directorio es volver a abrirlo (IndexedDB incluido).
 */
function launch(dir: string, testInfo: TestInfo): Promise<BrowserContext> {
  const use = testInfo.project.use;
  return chromium.launchPersistentContext(dir, { args: use.launchOptions?.args, viewport: use.viewport, baseURL: use.baseURL });
}

async function openGame(context: BrowserContext, query: string) {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`/?test=1&view=2${query}`);
  await page.waitForFunction(() => window.__santi?.ready === true);
  await waitWorldReady(page);
  return page;
}

test.describe("[mundos-y-persistencia] cerrar y volver a abrir el navegador", () => {
  test.slow();

  test("[mundos-y-persistencia] Los mundos sobreviven a recargar el navegador: Mis Mundos muestra los mismos 3 mundos con miniaturas y fechas", async ({ browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "perfil persistente de Chromium");
    const dir = testInfo.outputPath("perfil");
    const first = await launch(dir, testInfo);
    const page = await openGame(first, "&seed=tres-mundos");
    // En cada mundo, un bloque: así cada uno se guarda con su miniatura.
    const build = () =>
      page.evaluate(() => {
        const s = window.__santi!;
        const { x, z } = s.spawn();
        const [bx, bz] = [Math.floor(x) + 2, Math.floor(z) + 2];
        s.setBlock(bx, s.surfaceY(bx, bz) + 1, bz, "yellow");
      });
    for (let i = 0; i < 2; i++) {
      await build();
      await page.evaluate(() => window.__santi!.createWorld());
      await waitWorldReady(page);
    }
    await build();
    await page.evaluate(() => window.__santi!.saveNow());
    const before = await page.evaluate(() => window.__santi!.worlds().then((ws) => ws.map((w) => ({ id: w.id, updatedAt: w.updatedAt }))));
    expect(before).toHaveLength(3);
    await first.close();

    const second = await launch(dir, testInfo);
    const again = await openGame(second, "");
    await again.locator("#worlds-btn").click();
    const cards = again.locator(".world-card[data-world-id]");
    await expect(cards).toHaveCount(3);
    expect(await cards.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.worldId))).toEqual(before.map((w) => w.id));
    for (const w of before) {
      const card = again.locator(`.world-card[data-world-id="${w.id}"]`);
      await expect(card.locator(".world-thumb")).toHaveAttribute("style", /blob:/);
      const shown = new Date(w.updatedAt).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
      await expect(card.locator(".world-date")).toHaveText(shown);
    }
    await second.close();
  });

  test("[experiencia-infantil] Cerrar el navegador de golpe: al volver a abrirlo se pierden como mucho los últimos 30 s de cambios", async ({ browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "perfil persistente de Chromium");
    const dir = testInfo.outputPath("perfil");
    const first = await launch(dir, testInfo);
    const page = await openGame(first, "&seed=de-golpe");
    const worldId = await page.evaluate(() => window.__santi!.currentWorld()!.id);

    // Construye una torre: un bloque cada 2 s durante 40 s, sin perder el foco (solo el autoguardado).
    const saves = await page.evaluate(() => window.__santi!.saveCount());
    const { built, crashAt } = await page.evaluate(
      () =>
        new Promise<{ built: { x: number; y: number; z: number; at: number }[]; crashAt: number }>((resolve) => {
          const s = window.__santi!;
          const farm = s.layout()!.farm;
          const x = Math.floor((farm.x0 + farm.x1) / 2) + 2;
          const z = Math.floor((farm.z0 + farm.z1) / 2);
          const y0 = s.surfaceY(x, z) + 1;
          const built: { x: number; y: number; z: number; at: number }[] = [];
          const put = () => {
            if (built.length === 20) return resolve({ built, crashAt: performance.now() });
            const p = { x, y: y0 + built.length, z, at: performance.now() };
            s.setBlock(p.x, p.y, p.z, "red");
            built.push(p);
            setTimeout(put, 2000);
          };
          put();
        }),
    );
    expect(await page.evaluate(() => window.__santi!.saveCount())).toBeGreaterThan(saves);

    // El navegador se cierra de golpe: el proceso de la página muere sin pagehide ni blur.
    const cdp = await first.newCDPSession(page);
    const crashed = page.waitForEvent("crash");
    void cdp.send("Page.crash").catch(() => {});
    await crashed;
    await first.close().catch(() => {});

    const second = await launch(dir, testInfo);
    const again = await openGame(second, "&seed=de-golpe");
    expect(await again.evaluate(() => window.__santi!.currentWorld()!.id)).toBe(worldId);
    // Lo construido más de 30 s antes del cierre (más lo que tarda un guardado) sigue ahí.
    const old = built.filter((b) => crashAt - b.at > 30_000 + 3000);
    expect(old.length).toBeGreaterThan(0);
    for (const b of old) expect(await again.evaluate((b) => window.__santi!.getBlock(b.x, b.y, b.z), b), `bloque a ${Math.round((crashAt - b.at) / 1000)} s del cierre`).not.toBe(0);
    await second.close();
  });
});
