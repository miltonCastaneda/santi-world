import { expect, test, type Page } from "@playwright/test";
import { openTestGame } from "./helpers/game";
import { collectErrors, frameMs, latencyMs } from "./helpers/page";

const key = (type: "keydown" | "keyup", code: string) => `window.dispatchEvent(new KeyboardEvent("${type}", { code: "${code}", bubbles: true, cancelable: true }))`;

async function waitGrounded(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__santi!.player().onGround && window.__santi!.playerModel()?.anim === "idle");
}

test.describe("[personaje-y-herramientas] personaje y cámara", () => {
  test.beforeEach(async ({ page }) => {
    await openTestGame(page, "personaje", 2);
    await waitGrounded(page);
  });

  test("[personaje-y-herramientas] Animaciones: caminar en 100 ms o menos e idle en 300 ms o menos", async ({ page }) => {
    // El margen de un frame es del WebGL por software de CI, no del juego.
    const frame = await frameMs(page);
    const start = await page.evaluate(() => window.__santi!.player().pos);
    const toWalk = await latencyMs(page, key("keydown", "KeyW"), `window.__santi.playerModel().anim === "walk"`);
    await page.waitForTimeout(400);
    const moved = await page.evaluate(() => window.__santi!.player().pos);
    expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(0.5);
    const toIdle = await latencyMs(page, key("keyup", "KeyW"), `window.__santi.playerModel().anim === "idle"`);
    expect(toWalk).toBeLessThanOrEqual(100 + frame);
    expect(toIdle).toBeLessThanOrEqual(300 + frame);
  });

  test("[personaje-y-herramientas] La cámara sigue al personaje sin quedar dentro de los bloques", async ({ page }) => {
    // Un muro alto justo detrás del personaje: el brazo de la cámara choca con él.
    await page.evaluate(() => {
      const s = window.__santi!;
      const { pos: p, yaw } = s.player();
      const bx = Math.floor(p.x - Math.sin(yaw) * 2);
      const bz = Math.floor(p.z - Math.cos(yaw) * 2);
      for (let dx = -3; dx <= 3; dx++) for (let dy = 0; dy < 6; dy++) s.setBlock(bx + dx, Math.floor(p.y) + dy, bz, "stone");
      s.followPlayer();
    });
    const inside = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const s = window.__santi!;
          const keys = ["KeyS", "KeyA", "KeyW", "KeyD"];
          let bad = 0;
          let frames = 0;
          const t0 = performance.now();
          const tick = () => {
            const phase = Math.floor((performance.now() - t0) / 700) % keys.length;
            for (const [i, code] of keys.entries()) window.dispatchEvent(new KeyboardEvent(i === phase ? "keydown" : "keyup", { code }));
            const c = s.cameraPos();
            if (s.isSolid(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z))) bad++;
            frames++;
            if (performance.now() - t0 < 3000 || frames < 20) requestAnimationFrame(tick);
            else {
              for (const code of keys) window.dispatchEvent(new KeyboardEvent("keyup", { code }));
              resolve(bad);
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(inside).toBe(0);
  });

  test("[personaje-y-herramientas] Pérdida de foco: el personaje se detiene", async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" })));
    await page.waitForFunction(() => window.__santi!.playerModel()?.anim === "walk");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForFunction(() => window.__santi!.player().anim === "idle");
    const a = await page.evaluate(() => window.__santi!.player().pos);
    await page.waitForTimeout(600);
    const b = await page.evaluate(() => window.__santi!.player().pos);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.01);
  });

  test("[personaje-y-herramientas] Teclas no asignadas: nada destructivo ni navegación", async ({ page }) => {
    const errors = collectErrors(page);
    const url = page.url();
    const worldId = await page.evaluate(() => window.__santi!.currentWorld()!.id);
    const worlds = await page.evaluate(() => window.__santi!.worlds().then((w) => w.length));
    // Con un botón del HUD enfocado, como después de un clic del niño.
    await page.locator("#new-world-btn").focus();
    const keys = [..."qwertyuiopasdfghjklzxcvbnm0123456789", "Escape", "Backspace", "Enter", "Tab", "Delete", "Space", "F1", "F3", "PageDown", "Home", "Alt+ArrowLeft", "Control+s", "Control+p", "Control+r"];
    for (let round = 0; round < 2; round++) for (const k of keys) await page.keyboard.press(k);
    await page.waitForTimeout(500);
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => window.__santi!.currentWorld()!.id)).toBe(worldId);
    expect(await page.evaluate(() => window.__santi!.worlds().then((w) => w.length))).toBe(worlds);
    expect(await page.evaluate(() => window.__santi!.placedCount())).toBe(0);
    expect(errors).toEqual([]);
  });

  test("[experiencia-infantil] Menú contextual y Zoom accidental", async ({ page }) => {
    const prevented = await page.evaluate(() => {
      const canvas = document.querySelector("canvas#game")!;
      const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
      canvas.dispatchEvent(menu);
      const zoom = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 });
      canvas.dispatchEvent(zoom);
      const keyZoom = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ctrlKey: true, code: "Equal", key: "+" });
      window.dispatchEvent(keyZoom);
      return [menu.defaultPrevented, zoom.defaultPrevented, keyZoom.defaultPrevented];
    });
    expect(prevented).toEqual([true, true, true]);

    // La rueda sola cambia el bloque de la barra y no desplaza la página.
    const before = await page.evaluate(() => window.__santi!.selection().block);
    const box = (await page.locator("canvas#game").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 120);
    await page.waitForFunction((b) => window.__santi!.selection().block !== b, before);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY, window.visualViewport?.scale ?? 1])).toEqual([0, 0, 1]);
  });

  test("[personaje-y-herramientas] Elegir herramienta con un clic: la Espada en 200 ms o menos", async ({ page }) => {
    const frame = await frameMs(page);
    const ms = await latencyMs(
      page,
      `document.querySelector('.tool-btn[data-tool="sword"]').click()`,
      `document.querySelector('.tool-btn[data-tool="sword"]').classList.contains("active") && window.__santi.playerModel().shownTool === "sword"`,
    );
    expect(ms).toBeLessThanOrEqual(200 + frame);
    await expect(page.locator(".tool-btn.active")).toHaveCount(1);
  });

  test("[experiencia-infantil] Silencio: el botón alterna el audio", async ({ page }) => {
    await page.locator("canvas#game").click({ position: { x: 5, y: 5 } });
    await page.waitForFunction(() => window.__santi!.audio().ready);
    await page.getByRole("button", { name: "Silencio" }).click();
    expect(await page.evaluate(() => window.__santi!.audio().muted)).toBe(true);
    await expect(page.locator("#mute-btn")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Silencio" }).click();
    expect(await page.evaluate(() => window.__santi!.audio())).toMatchObject({ muted: false });
  });
});

test("[experiencia-infantil] Tamaño de los objetivos: 64x64 px o más a 1920x1080", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openTestGame(page, "objetivos", 2);
  const measure = (selector: string) =>
    page.locator(selector).evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { id: e.id || e.getAttribute("aria-label") || e.className, w: r.width, h: r.height };
        }),
    );
  const hud = await measure(".hud button");
  expect(hud.length).toBeGreaterThanOrEqual(5 + 5 + 9);
  for (const b of hud) expect(Math.min(b.w, b.h), b.id).toBeGreaterThanOrEqual(64);

  // Las zonas del HUD no se tapan entre sí, ni en 1080p ni en un portátil.
  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(size);
    const overlaps = await page.evaluate(() => {
      const zones = [".hearts", ".day-clock", ".actions", ".toolbar", ".hotbar", ".controls-help"].map((s) => [s, document.querySelector(s)!.getBoundingClientRect()] as const);
      const hits: string[] = [];
      for (const [i, [sa, a]] of zones.entries())
        for (const [sb, b] of zones.slice(i + 1)) if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits.push(`${sa} x ${sb}`);
      return hits;
    });
    expect(overlaps, `${size.width}x${size.height}`).toEqual([]);
  }

  await page.locator("#worlds-btn").click();
  await expect(page.locator(".worlds-panel")).toBeVisible();
  const panel = await measure(".worlds-panel button");
  expect(panel.length).toBeGreaterThan(0);
  for (const b of panel) expect(Math.min(b.w, b.h), b.id).toBeGreaterThanOrEqual(64);
});
