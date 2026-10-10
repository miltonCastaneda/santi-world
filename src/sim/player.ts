import type { Vec3 } from "../core/math";
import { JUMP_VELOCITY, moveBody, type Body, type CollisionQuery, type MoveResult } from "../domain/physics/collide";
import type { ToolId, ToolSwing } from "../domain/rules/tools";

export const PLAYER_SPEED = 4.3;
export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.6;
export const MAX_HEARTS = 5;
export const HIT_INVULNERABLE_MS = 1000;
export const RESPAWN_INVULNERABLE_MS = 5000;
export const REGEN_MS = 20_000;
export const ACTION_MS = 300;
const KNOCKBACK_SPEED = 5;
const KNOCKBACK_MS = 250;

export type PlayerAnim = "idle" | "walk" | "jump" | "action";

export type HitResult = "ignored" | "hurt" | "poof";

/** Personaje del niño: cuerpo físico, herramienta, corazones y estado de animación. Puro. */
export class Player {
  readonly body: Body;
  yaw = 0;
  hearts = MAX_HEARTS;
  tool: ToolId = "hand";
  /** Dirección de movimiento pedida (en el plano XZ, de longitud 0 a 1). Se mantiene hasta otra intent. */
  readonly moveInput = { x: 0, z: 0 };
  invulnerableUntil = 0;
  swing: ToolSwing = "place";
  actionUntil = 0;
  private jumpQueued = false;
  private lastHitAt = Number.NEGATIVE_INFINITY;
  private lastRegenAt = Number.NEGATIVE_INFINITY;
  private knock = { x: 0, z: 0, until: 0 };

  constructor(pos: Vec3) {
    this.body = { pos: { ...pos }, vel: { x: 0, y: 0, z: 0 }, halfWidth: PLAYER_HALF_WIDTH, height: PLAYER_HEIGHT, onGround: false };
  }

  get pos(): Vec3 {
    return this.body.pos;
  }

  eye(): Vec3 {
    return { x: this.body.pos.x, y: this.body.pos.y + EYE_HEIGHT, z: this.body.pos.z };
  }

  setMove(x: number, z: number): void {
    const len = Math.hypot(x, z);
    const k = len > 1 ? 1 / len : 1;
    this.moveInput.x = x * k;
    this.moveInput.z = z * k;
  }

  jump(): void {
    this.jumpQueued = true;
  }

  /** Empieza la animación de acción de la herramienta. */
  act(swing: ToolSwing, nowMs: number): void {
    this.swing = swing;
    this.actionUntil = nowMs + ACTION_MS;
  }

  animAt(nowMs: number): PlayerAnim {
    if (nowMs < this.actionUntil) return "action";
    if (!this.body.onGround) return "jump";
    if (this.moveInput.x !== 0 || this.moveInput.z !== 0) return "walk";
    return "idle";
  }

  isInvulnerable(nowMs: number): boolean {
    return nowMs < this.invulnerableUntil;
  }

  /** Un paso de simulación: velocidad pedida, salto, física y recuperación de corazones. */
  step(dtMs: number, nowMs: number, query: CollisionQuery): MoveResult {
    const b = this.body;
    const knocking = nowMs < this.knock.until;
    b.vel.x = this.moveInput.x * PLAYER_SPEED + (knocking ? this.knock.x : 0);
    b.vel.z = this.moveInput.z * PLAYER_SPEED + (knocking ? this.knock.z : 0);
    if (this.moveInput.x !== 0 || this.moveInput.z !== 0) this.yaw = Math.atan2(this.moveInput.x, this.moveInput.z);
    if (this.jumpQueued && b.onGround) b.vel.y = JUMP_VELOCITY;
    this.jumpQueued = false;
    const result = moveBody(b, dtMs / 1000, query);
    this.regen(nowMs);
    return result;
  }

  /**
   * Golpe de un enemigo: pierde 1 corazón, un empujón suave y 1 s sin poder recibir otro. Con 0
   * corazones hace "poof" y reaparece en `respawnAt` con todos los corazones y 5 s de invulnerabilidad.
   */
  hit(nowMs: number, from: Vec3 | null, respawnAt: Vec3): HitResult {
    if (this.isInvulnerable(nowMs)) return "ignored";
    this.hearts--;
    this.lastHitAt = nowMs;
    if (this.hearts <= 0) {
      this.respawn(respawnAt, nowMs);
      return "poof";
    }
    this.invulnerableUntil = nowMs + HIT_INVULNERABLE_MS;
    if (from) {
      const dx = this.body.pos.x - from.x;
      const dz = this.body.pos.z - from.z;
      const len = Math.hypot(dx, dz) || 1;
      this.knock = { x: (dx / len) * KNOCKBACK_SPEED, z: (dz / len) * KNOCKBACK_SPEED, until: nowMs + KNOCKBACK_MS };
      if (this.body.onGround) this.body.vel.y = 4;
    }
    return "hurt";
  }

  respawn(at: Vec3, nowMs: number): void {
    this.body.pos.x = at.x;
    this.body.pos.y = at.y;
    this.body.pos.z = at.z;
    this.body.vel.x = this.body.vel.y = this.body.vel.z = 0;
    this.body.onGround = false;
    this.hearts = MAX_HEARTS;
    this.invulnerableUntil = nowMs + RESPAWN_INVULNERABLE_MS;
    this.knock.until = 0;
    this.lastRegenAt = nowMs;
  }

  /** Corazones guardados al abrir un mundo; la recuperación cuenta desde ahora. */
  restoreHearts(hearts: number, nowMs: number): void {
    this.hearts = Math.max(1, Math.min(MAX_HEARTS, Math.round(hearts)));
    this.lastRegenAt = nowMs;
    this.invulnerableUntil = 0;
  }

  /** Lleva al personaje a un punto sin tocar sus corazones (al abrir un mundo). */
  teleport(at: Vec3): void {
    this.body.pos.x = at.x;
    this.body.pos.y = at.y;
    this.body.pos.z = at.z;
    this.body.vel.x = this.body.vel.y = this.body.vel.z = 0;
    this.body.onGround = false;
  }

  private regen(nowMs: number): void {
    if (this.hearts >= MAX_HEARTS) return;
    if (nowMs - Math.max(this.lastHitAt, this.lastRegenAt) < REGEN_MS) return;
    this.hearts++;
    this.lastRegenAt = nowMs;
  }
}
