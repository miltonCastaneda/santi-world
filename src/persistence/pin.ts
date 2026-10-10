import type { Clock } from "../core/clock";
import type { WorldRepository } from "../domain/repository/worldRepository";

export const PIN_HASH_KEY = "pinHash";
export const PIN_LOCK_KEY = "pinLock";
export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MS = 60_000;
const ITERATIONS = 100_000;

type PinHash = { salt: string; hash: string; iterations: number };
type PinLock = { failures: number; lockedUntil: number };

export type PinCheck = { ok: true } | { ok: false; lockedUntil: number | null; attemptsLeft: number };

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return toB64(new Uint8Array(bits));
}

/**
 * PIN opcional de la vista de padres (ADR-0012): hash PBKDF2-SHA-256 con sal en `meta`. Es
 * disuasorio, no seguridad real: los datos son locales.
 */
export class PinGuard {
  constructor(
    private readonly repo: WorldRepository,
    private readonly clock: Clock,
  ) {}

  async isEnabled(): Promise<boolean> {
    return (await this.repo.getMeta<PinHash>(PIN_HASH_KEY)) !== undefined;
  }

  async set(pin: string): Promise<void> {
    if (!isValidPin(pin)) throw new Error("El PIN debe tener 4 dígitos");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    await this.repo.setMeta(PIN_HASH_KEY, { salt: toB64(salt), hash: await derive(pin, salt, ITERATIONS), iterations: ITERATIONS });
    await this.repo.setMeta(PIN_LOCK_KEY, { failures: 0, lockedUntil: 0 });
  }

  async clear(): Promise<void> {
    await this.repo.setMeta(PIN_HASH_KEY, undefined);
    await this.repo.setMeta(PIN_LOCK_KEY, { failures: 0, lockedUntil: 0 });
  }

  /** Momento hasta el que está bloqueado, o null si se puede intentar. */
  async lockedUntil(): Promise<number | null> {
    const lock = await this.lock();
    return lock.lockedUntil > this.clock.now() ? lock.lockedUntil : null;
  }

  async verify(pin: string): Promise<PinCheck> {
    const stored = await this.repo.getMeta<PinHash>(PIN_HASH_KEY);
    if (!stored) return { ok: true };
    const lock = await this.lock();
    const now = this.clock.now();
    if (lock.lockedUntil > now) return { ok: false, lockedUntil: lock.lockedUntil, attemptsLeft: 0 };
    if (isValidPin(pin) && (await derive(pin, fromB64(stored.salt), stored.iterations)) === stored.hash) {
      await this.repo.setMeta(PIN_LOCK_KEY, { failures: 0, lockedUntil: 0 });
      return { ok: true };
    }
    const failures = lock.failures + 1;
    if (failures >= PIN_MAX_FAILURES) {
      const lockedUntil = now + PIN_LOCK_MS;
      await this.repo.setMeta(PIN_LOCK_KEY, { failures: 0, lockedUntil });
      return { ok: false, lockedUntil, attemptsLeft: 0 };
    }
    await this.repo.setMeta(PIN_LOCK_KEY, { failures, lockedUntil: 0 });
    return { ok: false, lockedUntil: null, attemptsLeft: PIN_MAX_FAILURES - failures };
  }

  private async lock(): Promise<PinLock> {
    return (await this.repo.getMeta<PinLock>(PIN_LOCK_KEY)) ?? { failures: 0, lockedUntil: 0 };
  }
}
