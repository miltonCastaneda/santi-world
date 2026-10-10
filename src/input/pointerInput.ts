import * as THREE from "three";
import type { Ray } from "../core/math";
import type { Intent } from "../sim/game";

const DRAG_THRESHOLD = 8;

/**
 * Clic izquierdo (o toque) sobre el canvas: usa la herramienta en el punto apuntado. Un arrastre
 * (más de 8 px) no hace nada; el botón derecho es para girar la cámara (FollowCamera).
 */
export class PointerInput {
  private pointerDown = new THREE.Vector2();
  private dragging = false;
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    canvas: HTMLCanvasElement,
    private camera: THREE.Camera,
    private send: (intent: Intent) => void,
  ) {
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.pointerDown.set(event.clientX, event.clientY);
      this.dragging = false;
    });

    canvas.addEventListener("pointermove", (event) => {
      if ((event.buttons & 1) === 0) return;
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) this.dragging = true;
    });

    canvas.addEventListener("pointerup", (event) => {
      if (event.button !== 0 || this.dragging) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      this.send({ type: "useTool", ray: this.rayFromNdc(ndc) });
    });
  }

  private rayFromNdc(ndc: THREE.Vector2): Ray {
    this.raycaster.setFromCamera(ndc, this.camera);
    const { origin: o, direction: d } = this.raycaster.ray;
    return { origin: { x: o.x, y: o.y, z: o.z }, direction: { x: d.x, y: d.y, z: d.z } };
  }
}
