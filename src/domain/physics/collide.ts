import type { Vec3 } from "../../core/math";

/** Gravedad, velocidad terminal y salto (ADR-0007). Unidades: bloques y segundos. */
export const GRAVITY = 25;
export const TERMINAL_VELOCITY = 30;
/** Llega a unos 1,3 bloques: sube un escalón de 1, nunca una cerca de 1,5. */
export const JUMP_VELOCITY = 8.2;

/**
 * Altura de colisión de la celda (0 si no es sólida). Fuera del mundo en horizontal debe devolver
 * Infinity: es la barrera natural invisible del borde.
 */
export type CollisionQuery = (x: number, y: number, z: number) => number;

/** Cuerpo físico: `pos` es el centro de los pies. */
export type Body = {
  pos: Vec3;
  vel: Vec3;
  /** Mitad del ancho (en X y en Z). */
  halfWidth: number;
  height: number;
  onGround: boolean;
};

export type MoveResult = { hitX: boolean; hitZ: boolean; landed: boolean; hitCeiling: boolean };

const EPS = 1e-4;

type Box = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };

function bodyBox(b: Body): Box {
  return { x0: b.pos.x - b.halfWidth, y0: b.pos.y, z0: b.pos.z - b.halfWidth, x1: b.pos.x + b.halfWidth, y1: b.pos.y + b.height, z1: b.pos.z + b.halfWidth };
}

/**
 * Recorre las cajas de colisión de las celdas que tocan `box`. Una cerca (altura 1,5) ocupa también
 * la mitad de la celda de arriba, por eso se mira una celda más abajo.
 */
function forEachSolid(box: Box, query: CollisionQuery, fn: (cell: Box) => void): void {
  const x0 = Math.floor(box.x0);
  const x1 = Math.floor(box.x1 - EPS);
  const z0 = Math.floor(box.z0);
  const z1 = Math.floor(box.z1 - EPS);
  const y0 = Math.floor(box.y0) - 1;
  const y1 = Math.floor(box.y1 - EPS);
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        const h = query(x, y, z);
        if (h <= 0) continue;
        const top = h === Infinity ? Infinity : y + h;
        const bottom = h === Infinity ? -Infinity : y;
        if (top <= box.y0 + EPS || bottom >= box.y1 - EPS) continue;
        fn({ x0: x, y0: bottom, z0: z, x1: x + 1, y1: top, z1: z + 1 });
      }
    }
  }
}

/**
 * Mueve un eje y lo detiene contra la primera caja sólida del barrido. Devuelve si chocó.
 * Es el mismo recorrido que `forEachSolid` sin crear objetos: se llama por cada entidad y paso.
 */
function sweepAxis(b: Body, axis: "x" | "y" | "z", delta: number, query: CollisionQuery): boolean {
  if (delta === 0) return false;
  const hw = b.halfWidth;
  const bx0 = b.pos.x - hw;
  const bx1 = b.pos.x + hw;
  const by0 = b.pos.y;
  const by1 = b.pos.y + b.height;
  const bz0 = b.pos.z - hw;
  const bz1 = b.pos.z + hw;
  // Caja barrida: la de ahora más el recorrido en este eje.
  const sx0 = axis === "x" && delta < 0 ? bx0 + delta : bx0;
  const sx1 = axis === "x" && delta > 0 ? bx1 + delta : bx1;
  const sy0 = axis === "y" && delta < 0 ? by0 + delta : by0;
  const sy1 = axis === "y" && delta > 0 ? by1 + delta : by1;
  const sz0 = axis === "z" && delta < 0 ? bz0 + delta : bz0;
  const sz1 = axis === "z" && delta > 0 ? bz1 + delta : bz1;
  const boxLo = axis === "x" ? bx0 : axis === "y" ? by0 : bz0;
  const boxHi = axis === "x" ? bx1 : axis === "y" ? by1 : bz1;
  const x0 = Math.floor(sx0);
  const x1 = Math.floor(sx1 - EPS);
  const z0 = Math.floor(sz0);
  const z1 = Math.floor(sz1 - EPS);
  const y0 = Math.floor(sy0) - 1;
  const y1 = Math.floor(sy1 - EPS);
  let allowed = delta;
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        const h = query(x, y, z);
        if (h <= 0) continue;
        const top = h === Infinity ? Infinity : y + h;
        const bottom = h === Infinity ? -Infinity : y;
        if (top <= sy0 + EPS || bottom >= sy1 - EPS) continue;
        const cellLo = axis === "x" ? x : axis === "y" ? bottom : z;
        const cellHi = axis === "x" ? x + 1 : axis === "y" ? top : z + 1;
        // Solo cuentan las celdas que no se solapaban ya antes de moverse (si está atascado, puede salir).
        if (delta > 0 && cellLo >= boxHi - EPS) allowed = Math.min(allowed, cellLo - boxHi - EPS);
        if (delta < 0 && cellHi <= boxLo + EPS) allowed = Math.max(allowed, cellHi - boxLo + EPS);
      }
    }
  }
  if (delta > 0) allowed = Math.max(0, allowed);
  else allowed = Math.min(0, allowed);
  b.pos[axis] += allowed;
  return allowed !== delta;
}

/**
 * Integra la gravedad y mueve el cuerpo con barrido por eje: primero Y, luego X y luego Z
 * (ADR-0007). Nunca atraviesa un bloque, ni siquiera a velocidad terminal.
 */
export function moveBody(b: Body, dtSeconds: number, query: CollisionQuery): MoveResult {
  b.vel.y = Math.max(-TERMINAL_VELOCITY, b.vel.y - GRAVITY * dtSeconds);
  const wasOnGround = b.onGround;
  const hitY = sweepAxis(b, "y", b.vel.y * dtSeconds, query);
  const falling = b.vel.y < 0;
  b.onGround = hitY && falling;
  const hitCeiling = hitY && !falling;
  if (hitY) b.vel.y = 0;
  const hitX = sweepAxis(b, "x", b.vel.x * dtSeconds, query);
  const hitZ = sweepAxis(b, "z", b.vel.z * dtSeconds, query);
  if (hitX) b.vel.x = 0;
  if (hitZ) b.vel.z = 0;
  return { hitX, hitZ, landed: b.onGround && !wasOnGround, hitCeiling };
}

/** Hay algo sólido dentro del cuerpo (por ejemplo, alguien puso un bloque encima). */
export function isStuck(b: Body, query: CollisionQuery): boolean {
  let stuck = false;
  forEachSolid(bodyBox(b), query, () => (stuck = true));
  return stuck;
}

/** La celda (x, y, z) se superpone con el cuerpo. */
export function bodyOverlapsCell(b: Body, x: number, y: number, z: number): boolean {
  const box = bodyBox(b);
  return box.x0 < x + 1 - EPS && box.x1 > x + EPS && box.y0 < y + 1 - EPS && box.y1 > y + EPS && box.z0 < z + 1 - EPS && box.z1 > z + EPS;
}
