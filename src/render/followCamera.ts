import type * as THREE from "three";
import { raycastVoxels, type Vec3 } from "../core/math";

export const ARM_LENGTH = 6;
export const DEFAULT_PITCH = (20 * Math.PI) / 180;
const MIN_PITCH = (5 * Math.PI) / 180;
const MAX_PITCH = (60 * Math.PI) / 180;
const RETURN_DELAY_MS = 3000;
/** Separación de la cámara respecto del bloque con el que choca el brazo. */
const WALL_GAP = 0.3;
const DRAG_SPEED = 0.006;
/** Altura del punto al que mira la cámara, sobre los pies del personaje. */
export const LOOK_HEIGHT = 1.5;

/**
 * Cámara en tercera persona con brazo de resorte (design D11). Nunca queda dentro de un bloque: el
 * brazo se acorta en el acto con un raycast DDA y se vuelve a alargar con suavidad.
 */
export class FollowCamera {
  /** Rumbo de la cámara (hacia dónde mira, en el plano XZ). */
  yaw = 0;
  pitch = DEFAULT_PITCH;
  private arm = ARM_LENGTH;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private releasedAt = Number.NEGATIVE_INFINITY;
  private manual = false;
  private target: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly listeners: [string, (e: PointerEvent) => void][];

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly isSolid: (x: number, y: number, z: number) => boolean,
    private readonly now: () => number,
  ) {
    const down = (e: PointerEvent) => {
      if (e.button !== 2) return;
      this.dragging = true;
      this.manual = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.yaw -= (e.clientX - this.lastX) * DRAG_SPEED;
      this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + (e.clientY - this.lastY) * DRAG_SPEED));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.button !== 2 || !this.dragging) return;
      this.dragging = false;
      this.releasedAt = this.now();
    };
    this.listeners = [
      ["pointerdown", down],
      ["pointermove", move],
      ["pointerup", up],
      ["pointercancel", up],
    ];
    for (const [type, fn] of this.listeners) canvas.addEventListener(type, fn as EventListener);
  }

  /** Coloca la cámara detrás del personaje al instante (al abrir un mundo o al reaparecer). */
  snap(feet: Vec3, playerYaw: number): void {
    this.yaw = playerYaw;
    this.pitch = DEFAULT_PITCH;
    this.manual = false;
    this.arm = ARM_LENGTH;
    this.update(0, feet, playerYaw, false);
  }

  /** Punto al que mira la cámara. */
  get focus(): Vec3 {
    return this.target;
  }

  /**
   * @param moving si el personaje camina; la cámara lo sigue por detrás salvo que camine hacia ella.
   */
  update(dtSeconds: number, feet: Vec3, playerYaw: number, moving: boolean): void {
    this.target = { x: feet.x, y: feet.y + LOOK_HEIGHT, z: feet.z };
    if (!this.dragging) {
      const returning = this.manual && this.now() - this.releasedAt >= RETURN_DELAY_MS;
      if (returning) this.manual = false;
      let diff = playerYaw - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      // Caminando hacia la cámara no se gira (daría vueltas sin fin); quieto o de frente, vuelve atrás.
      const follow = !this.manual && (!moving || Math.abs(diff) < (2 * Math.PI) / 3);
      if (follow) this.yaw += diff * (1 - Math.exp(-dtSeconds * (moving ? 2.5 : 1.5)));
      const pitchDiff = DEFAULT_PITCH - this.pitch;
      if (!this.manual) this.pitch += pitchDiff * (1 - Math.exp(-dtSeconds * 2));
    }

    // Dirección desde el objetivo hacia la cámara (detrás y por encima).
    const back = {
      x: -Math.sin(this.yaw) * Math.cos(this.pitch),
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * Math.cos(this.pitch),
    };
    const hit = raycastVoxels({ origin: this.target, direction: back }, ARM_LENGTH + 1, this.isSolid);
    // Siempre antes del bloque con el que choca (aunque esté pegado a la cabeza).
    const limit = hit ? Math.max(hit.distance * 0.5, hit.distance - WALL_GAP) : ARM_LENGTH;
    // Se acorta en el acto (nunca dentro de un bloque) y se alarga con suavidad.
    this.arm = limit < this.arm ? limit : this.arm + (limit - this.arm) * (1 - Math.exp(-dtSeconds * 4));
    this.camera.position.set(this.target.x + back.x * this.arm, this.target.y + back.y * this.arm, this.target.z + back.z * this.arm);
    this.camera.lookAt(this.target.x, this.target.y, this.target.z);
  }

  dispose(): void {
    for (const [type, fn] of this.listeners) this.canvas.removeEventListener(type, fn as EventListener);
  }
}
