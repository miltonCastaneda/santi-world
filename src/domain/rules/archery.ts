import { normalize, type Vec3 } from "../../core/math";

/** La flecha del Arco (design D9): balística suave, sin munición y con una cadencia máxima. */
export const ARROW = {
  /** Bloques por segundo al salir del arco. */
  speed: 30,
  /** Bloques por segundo al cuadrado (más suave que la de los cuerpos). */
  gravity: 10,
  /** Subpasos por tick: a 30 bloques/s nunca salta más de medio bloque. */
  substeps: 3,
  lifeMs: 3000,
  perSecond: 3,
} as const;

/** Entre dos flechas: así nunca salen más de 3 en un segundo, por más clics que haga el niño. */
export const SHOT_INTERVAL_MS = Math.ceil(1000 / ARROW.perSecond);

/** Si el dragón está a este ángulo o menos del centro de la vista, la flecha va hacia él. */
export const AIM_CONE_DEG = 12;

export function canShoot(lastShotAt: number | null, now: number): boolean {
  return lastShotAt === null || now - lastShotAt >= SHOT_INTERVAL_MS;
}

/** Ángulo en grados entre dos direcciones (0 si alguna es nula). */
export function angleDeg(a: Vec3, b: Vec3): number {
  const la = Math.hypot(a.x, a.y, a.z);
  const lb = Math.hypot(b.x, b.y, b.z);
  if (la === 0 || lb === 0) return 0;
  const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * Velocidad inicial (de módulo `speed`) para alcanzar un blanco que se mueve a velocidad constante:
 * se apunta a su posición prevista, un poco más arriba para compensar la caída de la flecha.
 */
export function leadVelocity(from: Vec3, target: Vec3, targetVel: Vec3, speed = ARROW.speed, gravity = ARROW.gravity): Vec3 {
  let t = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z) / speed;
  let d = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 6; i++) {
    d = {
      x: target.x + targetVel.x * t - from.x,
      y: target.y + targetVel.y * t - from.y + 0.5 * gravity * t * t,
      z: target.z + targetVel.z * t - from.z,
    };
    t = Math.hypot(d.x, d.y, d.z) / speed;
  }
  if (t === 0) return { x: 0, y: 0, z: 0 };
  return { x: d.x / t, y: d.y / t, z: d.z / t };
}

/**
 * Velocidad de una flecha disparada hacia `dir`. Con el dragón a `AIM_CONE_DEG` o menos, se
 * corrige hacia su posición prevista (asistencia de puntería para un niño de 4 años).
 */
export function aimArrow(from: Vec3, dir: Vec3, target: { center: Vec3; vel: Vec3 } | null, speed = ARROW.speed, gravity = ARROW.gravity): Vec3 {
  const d = normalize(dir);
  const straight = { x: d.x * speed, y: d.y * speed, z: d.z * speed };
  if (!target) return straight;
  const to = { x: target.center.x - from.x, y: target.center.y - from.y, z: target.center.z - from.z };
  if (angleDeg(d, to) > AIM_CONE_DEG) return straight;
  return leadVelocity(from, target.center, target.vel, speed, gravity);
}
