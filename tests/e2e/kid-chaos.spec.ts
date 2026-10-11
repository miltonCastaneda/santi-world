import { expect, test, type Page } from "@playwright/test";
import { openTestGame, waitWorldReady } from "./helpers/game";
import { collectErrors, frameMs } from "./helpers/page";

/** Generador con semilla (mulberry32): la misma secuencia "aleatoria" en cada ejecución. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function unlockAudio(page: Page): Promise<void> {
  await page.locator("canvas#game").click({ position: { x: 5, y: 5 } });
  await page.waitForFunction(() => window.__santi!.audio().ready);
}

test("[experiencia-infantil] Respuesta inmediata: cada botón del HUD se hunde y suena en 200 ms o menos", async ({ page }) => {
  await openTestGame(page, "respuesta", 2);
  await unlockAudio(page);
  // El margen de un frame es del WebGL por software de CI, no del juego.
  const frame = await frameMs(page);
  const ids = await page.locator(".hud button.tool-btn, .hud button.block-btn, .hud button.action-btn").evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null && !["full-btn", "mute-btn", "new-world-btn"].includes(e.id)).map((e, i) => {
      (e as HTMLElement).dataset.probe = String(i);
      return String(i);
    }),
  );
  expect(ids.length).toBeGreaterThanOrEqual(5 + 9);
  for (const id of ids) {
    const button = page.locator(`[data-probe="${id}"]`);
    const label = (await button.getAttribute("aria-label")) ?? id;
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // Los tiempos se miden en la página desde el evento del puntero (sin la ida y vuelta de Playwright).
    await page.evaluate((id) => {
      const el = document.querySelector<HTMLElement>(`[data-probe="${id}"]`)!;
      const w = window as unknown as { __probe: { pressed?: number; sound?: number } };
      w.__probe = {};
      const until = (done: () => boolean, from: number, key: "pressed" | "sound") => {
        const check = () => {
          if (done()) w.__probe[key] = performance.now() - from;
          else if (performance.now() - from > 2000) w.__probe[key] = Infinity;
          else requestAnimationFrame(check);
        };
        check();
      };
      // Se hunde mientras se pulsa (resaltado inmediato): la transición de 80 ms ya empezó o ya terminó.
      el.addEventListener(
        "pointerdown",
        (e) =>
          until(() => {
            const t = getComputedStyle(el).transform;
            const moving = el.getAnimations().some((a) => a instanceof CSSTransition && a.transitionProperty === "transform");
            return moving || (t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)");
          }, e.timeStamp, "pressed"),
        { once: true },
      );
      el.addEventListener(
        "pointerup",
        (e) => {
          const clicks = window.__santi!.audio().requests.click ?? 0;
          until(() => (window.__santi!.audio().requests.click ?? 0) > clicks, e.timeStamp, "sound");
        },
        { once: true, capture: true },
      );
    }, id);
    await page.mouse.down();
    const pressed = await page.waitForFunction(() => (window as unknown as { __probe: { pressed?: number } }).__probe.pressed).then((h) => h.jsonValue() as Promise<number>);
    await page.mouse.up();
    const sound = await page.waitForFunction(() => (window as unknown as { __probe: { sound?: number } }).__probe.sound).then((h) => h.jsonValue() as Promise<number>);
    expect(pressed, `${label}: se hunde`).toBeLessThanOrEqual(200 + frame);
    expect(sound, `${label}: suena`).toBeLessThanOrEqual(200 + frame);
    if (await page.locator(".worlds-panel").isVisible()) await page.locator(".worlds-close").click();
    if (await page.locator("#bag-btn[aria-pressed=true]").count()) await page.locator("#bag-btn").click();
  }
});

test("[experiencia-infantil] Secuencia aleatoria de acciones: tras 1000 clics, teclas y botones el mundo sigue, se recupera al recargar y no hay errores", async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await openTestGame(page, "caos", 2);
  // Un mundo con construcciones e inventario.
  const firstId = await page.evaluate(() => {
    const s = window.__santi!;
    const { x, z } = s.spawn();
    for (let i = 0; i < 6; i++) s.setBlock(Math.floor(x) + 3, s.surfaceY(Math.floor(x) + 3, Math.floor(z)) + 1, Math.floor(z) + i - 3, "red");
    s.setInventory({ diamond: 3, meat: 2 });
    return s.currentWorld()!.id;
  });

  const random = rng(20261010);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
  const keys = ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyE", "KeyQ", "KeyZ", "Digit1", "Digit5", "Digit9", "ArrowUp", "ArrowLeft", "Escape", "Enter", "Tab", "Backspace", "KeyM", "KeyP"];
  const { width, height } = page.viewportSize()!;
  for (let i = 0; i < 1000; i++) {
    const r = random();
    if (r < 0.45) {
      await page.mouse.click(Math.floor(random() * width), Math.floor(random() * height), { button: random() < 0.8 ? "left" : "right" });
    } else if (r < 0.8) {
      await page.keyboard.press(pick(keys));
    } else if (r < 0.9) {
      await page.mouse.wheel(0, random() < 0.5 ? 120 : -120);
    } else {
      // Un botón visible cualquiera (HUD, Mis Mundos o el inventario), menos pantalla completa.
      const buttons = page.locator("button:visible:not(#full-btn)");
      const n = await buttons.count();
      if (n > 0) await buttons.nth(Math.floor(random() * n)).click({ timeout: 2000 }).catch(() => {});
    }
  }

  if (await page.locator(".worlds-panel").isVisible()) await page.locator(".worlds-close").click();
  await page.waitForFunction(() => !document.querySelector(".worlds-panel.busy"));
  await waitWorldReady(page);
  const worlds = await page.evaluate(() => window.__santi!.worlds().then((ws) => ws.map((w) => w.id)));
  expect(worlds).toContain(firstId);
  await page.evaluate(() => window.__santi!.saveNow());
  const state = await page.evaluate(() => {
    const s = window.__santi!;
    return { id: s.currentWorld()!.id, placed: s.placedCount(), inventory: s.inventory() };
  });

  await page.goto("/?test=1&view=2");
  await page.waitForFunction(() => window.__santi?.ready === true);
  await waitWorldReady(page);
  expect(
    await page.evaluate(() => {
      const s = window.__santi!;
      return { id: s.currentWorld()!.id, placed: s.placedCount(), inventory: s.inventory() };
    }),
  ).toEqual(state);
  expect(errors).toEqual([]);
});
