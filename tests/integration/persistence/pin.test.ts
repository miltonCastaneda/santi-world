import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "../../../src/core/clock";
import { InMemoryWorldRepository } from "../../../src/persistence/inMemoryRepository";
import { PIN_HASH_KEY, PIN_LOCK_MS, PinGuard } from "../../../src/persistence/pin";
import { sequentialIds } from "./repositoryContract";

describe("[vista-de-padres] Protección opcional con PIN", () => {
  let clock: FakeClock;
  let repo: InMemoryWorldRepository;
  let pin: PinGuard;

  beforeEach(() => {
    clock = new FakeClock(1_000_000);
    repo = new InMemoryWorldRepository({ clock, newId: sequentialIds() });
    pin = new PinGuard(repo, clock);
  });

  it("[vista-de-padres] PIN desactivado: se accede directamente", async () => {
    expect(await pin.isEnabled()).toBe(false);
    expect(await pin.verify("")).toEqual({ ok: true });
  });

  it("guarda un hash con sal, nunca el PIN en texto plano", async () => {
    await pin.set("1234");
    const stored = JSON.stringify(await repo.getMeta(PIN_HASH_KEY));
    expect(stored).not.toContain("1234");
    expect(await pin.isEnabled()).toBe(true);
    expect(await pin.verify("1234")).toEqual({ ok: true });
  });

  it("rechaza PIN que no son de 4 dígitos", async () => {
    await expect(pin.set("12a4")).rejects.toThrow();
    await expect(pin.set("123")).rejects.toThrow();
  });

  it("[vista-de-padres] PIN activo e incorrecto: 5 fallos bloquean 60 s", async () => {
    await pin.set("1234");
    for (let i = 4; i >= 1; i--) expect(await pin.verify("0000")).toEqual({ ok: false, lockedUntil: null, attemptsLeft: i });
    const fifth = await pin.verify("0000");
    expect(fifth).toEqual({ ok: false, lockedUntil: clock.now() + PIN_LOCK_MS, attemptsLeft: 0 });
    // Bloqueado: ni el PIN correcto entra, y recargar la página (otro PinGuard) no lo salta.
    expect((await new PinGuard(repo, clock).verify("1234")).ok).toBe(false);
    clock.advance(PIN_LOCK_MS - 1);
    expect(await pin.lockedUntil()).not.toBeNull();
    clock.advance(1);
    expect(await pin.lockedUntil()).toBeNull();
    expect(await pin.verify("1234")).toEqual({ ok: true });
  });

  it("un acierto reinicia el contador de fallos y desactivar quita el PIN", async () => {
    await pin.set("4321");
    await pin.verify("0000");
    await pin.verify("4321");
    expect(await pin.verify("0000")).toMatchObject({ attemptsLeft: 4 });
    await pin.clear();
    expect(await pin.isEnabled()).toBe(false);
  });
});
