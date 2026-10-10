import type { Intent } from "../sim/game";

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/** Teclas que el navegador usaría para desplazar, retroceder, buscar o recargar: no hacen nada. */
const BLOCKED_KEYS = new Set(["Space", "Enter", "NumpadEnter", "Backspace", "Tab", "PageUp", "PageDown", "Home", "End", "F1", "F5", "F6", "F7", "F10", "Slash", "Quote", "ContextMenu"]);
/** Con Ctrl o Meta: zoom, recargar, buscar, imprimir, guardar, abrir, historial, marcadores, etc. */
const BLOCKED_CTRL = new Set(["Equal", "Minus", "NumpadAdd", "NumpadSubtract", "Digit0", "Numpad0", "KeyR", "KeyF", "KeyG", "KeyP", "KeyS", "KeyO", "KeyH", "KeyJ", "KeyD", "KeyU", "KeyE", "KeyK", "KeyL"]);

const WHEEL_THROTTLE_MS = 120;

export type GameInputDeps = {
  send(intent: Intent): void;
  /** Rumbo de la cámara: "adelante" es hacia donde mira. */
  headingYaw(): number;
  /** Elige el elemento n (0 a 8) de la barra inferior. */
  selectSlot(index: number): void;
  /** Avanza o retrocede en la barra inferior con la rueda. */
  cycleSlot(delta: 1 | -1): void;
  /** Mientras haya un panel abierto (por ejemplo "Mis Mundos"), el teclado no mueve al personaje. */
  isBlocked?(): boolean;
};

/**
 * Teclado y rueda del juego (design D11) y protecciones del navegador a prueba de niños: sin menú
 * contextual, sin zoom, sin desplazar la página y sin seleccionar texto. Al perder el foco se
 * sueltan todas las teclas.
 */
export class GameInput {
  private readonly pressed = new Set<string>();
  private lastSent = { x: 0, z: 0 };
  private lastWheel = 0;
  private lastYaw = 0;

  constructor(
    win: Window,
    private readonly canvas: HTMLCanvasElement,
    private readonly deps: GameInputDeps,
  ) {
    win.addEventListener("keydown", this.onKeyDown, { capture: true });
    win.addEventListener("keyup", this.onKeyUp, { capture: true });
    win.addEventListener("blur", this.releaseAll);
    win.document.addEventListener("visibilitychange", () => win.document.hidden && this.releaseAll());
    win.addEventListener("wheel", this.onWheel, { passive: false, capture: true });
    win.document.addEventListener("contextmenu", (e) => e.preventDefault());
    win.document.addEventListener("selectstart", (e) => e.preventDefault());
    win.document.addEventListener("dragstart", (e) => e.preventDefault());
    // Gestos de zoom con el trackpad en Safari.
    win.document.addEventListener("gesturestart", (e) => e.preventDefault());
  }

  /** Recalcula la dirección si la cámara giró mientras se camina. Llamar en cada frame. */
  update(): void {
    if (this.pressed.size === 0) return;
    const yaw = this.deps.headingYaw();
    if (Math.abs(yaw - this.lastYaw) > 0.01) this.sendMove();
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && BLOCKED_CTRL.has(e.code)) {
      e.preventDefault();
      return;
    }
    if (e.altKey && (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "Home")) {
      e.preventDefault();
      return;
    }
    const target = e.target as HTMLElement | null;
    // En un campo de texto (no hay en el juego del niño, pero por si acaso) no se interfiere.
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if (this.deps.isBlocked?.()) {
      if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
      return;
    }
    // Tras un clic en un botón del HUD, Espacio o Enter no deben volver a pulsarlo (p. ej. "nuevo mundo").
    if (target?.tagName === "BUTTON") target.blur();

    if (e.code in MOVE_KEYS) {
      e.preventDefault();
      if (!this.pressed.has(e.code)) {
        this.pressed.add(e.code);
        this.sendMove();
      }
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) this.deps.send({ type: "jump" });
      return;
    }
    if (/^Digit[1-9]$/.test(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.deps.selectSlot(Number(e.code.slice(5)) - 1);
      return;
    }
    if (e.code === "KeyE" && !e.repeat) {
      e.preventDefault();
      this.deps.send({ type: "toggleInventory" });
      return;
    }
    if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (this.pressed.delete(e.code)) this.sendMove();
  };

  private readonly onWheel = (e: WheelEvent) => {
    // Nunca zoom ni desplazamiento: la rueda solo cambia el elemento de la barra.
    e.preventDefault();
    if (e.ctrlKey || e.target !== this.canvas) return;
    const now = performance.now();
    if (now - this.lastWheel < WHEEL_THROTTLE_MS || e.deltaY === 0) return;
    this.lastWheel = now;
    this.deps.cycleSlot(e.deltaY > 0 ? 1 : -1);
  };

  /** Suelta todas las teclas: el personaje se detiene y no queda caminando solo. */
  readonly releaseAll = () => {
    this.pressed.clear();
    this.sendMove();
  };

  private sendMove(): void {
    let right = 0;
    let fwd = 0;
    for (const code of this.pressed) {
      const [r, f] = MOVE_KEYS[code];
      right += r;
      fwd += f;
    }
    right = Math.sign(right);
    fwd = Math.sign(fwd);
    const yaw = this.deps.headingYaw();
    this.lastYaw = yaw;
    // Adelante = (sin yaw, cos yaw); derecha = adelante girado -90° en el plano XZ.
    const x = fwd * Math.sin(yaw) - right * Math.cos(yaw);
    const z = fwd * Math.cos(yaw) + right * Math.sin(yaw);
    const len = Math.hypot(x, z);
    const move = len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
    if (Math.abs(move.x - this.lastSent.x) < 1e-3 && Math.abs(move.z - this.lastSent.z) < 1e-3) return;
    this.lastSent = move;
    this.deps.send({ type: "move", ...move });
  }
}
