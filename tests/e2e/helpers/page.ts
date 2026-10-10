import type { Page } from "@playwright/test";

/**
 * Duración de un frame lento en esta máquina: el más largo de 10. Con WebGL por software un frame
 * puede pasar de 50 ms y variar al doble de uno a otro.
 */
export async function frameMs(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let last = performance.now();
        let slowest = 0;
        let n = 0;
        const tick = () => {
          const now = performance.now();
          slowest = Math.max(slowest, now - last);
          last = now;
          if (++n === 10) resolve(slowest);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** Ejecuta `action` en la página y mide cuánto tarda `done` en cumplirse, comprobando en cada frame. */
export async function latencyMs(page: Page, action: string, done: string): Promise<number> {
  return page.evaluate(
    ([action, done]) =>
      new Promise<number>((resolve, reject) => {
        const t0 = performance.now();
        new Function(action)();
        const check = () => {
          if (new Function(`return (${done})`)()) return resolve(performance.now() - t0);
          if (performance.now() - t0 > 5000) return reject(new Error(`no se cumplió: ${done}`));
          requestAnimationFrame(check);
        };
        check();
      }),
    [action, done] as const,
  );
}

/** Junta los errores de consola y las excepciones no capturadas de la página. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/**
 * Cuenta los colores distintos de una captura del canvas. Un canvas en blanco
 * (o de un solo color) devuelve 1 o 2; una escena dibujada devuelve cientos.
 */
export async function countCanvasColors(page: Page, selector = "canvas"): Promise<number> {
  const png = await page.locator(selector).first().screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 7) {
      colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return colors.size;
  }, png.toString("base64"));
}

/** Cuenta los píxeles de una captura parecidos a un color (distancia Manhattan en RGB). */
export async function countPixelsNear(page: Page, rgb: [number, number, number], tolerance = 12, selector = "canvas"): Promise<number> {
  const png = await page.locator(selector).first().screenshot();
  return page.evaluate(
    async ([b64, rgb, tolerance]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - rgb[0]) + Math.abs(data[i + 1] - rgb[1]) + Math.abs(data[i + 2] - rgb[2]) <= tolerance) n++;
      }
      return n;
    },
    [png.toString("base64"), rgb, tolerance] as const,
  );
}

/** Brillo medio (0 a 255) de una captura del canvas. */
export async function canvasBrightness(page: Page, selector = "canvas"): Promise<number> {
  const png = await page.locator(selector).first().screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    return sum / (data.length / 4);
  }, png.toString("base64"));
}

/**
 * Compara dos capturas del mismo tamaño: cuántos píxeles cambian (distancia Manhattan en RGB mayor
 * que `threshold`) y cuánto cambian de media esos píxeles.
 */
export async function diffShots(page: Page, a: Buffer, b: Buffer, threshold = 30): Promise<{ changed: number; meanDelta: number }> {
  return page.evaluate(
    async ([a64, b64, threshold]) => {
      const pixels = async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const [pa, pb] = await Promise.all([pixels(a64), pixels(b64)]);
      let changed = 0;
      let total = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
        if (d > threshold) {
          changed++;
          total += d;
        }
      }
      return { changed, meanDelta: changed ? total / changed : 0 };
    },
    [a.toString("base64"), b.toString("base64"), threshold] as const,
  );
}

export async function hideHud(page: Page): Promise<void> {
  await page.addStyleTag({ content: ".hud, .top-bar { display: none !important; }" });
}
