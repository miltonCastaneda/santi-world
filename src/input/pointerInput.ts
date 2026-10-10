import * as THREE from "three";
import type { Ray } from "../core/math";
import type { Intent } from "../sim/game";

const DRAG_THRESHOLD = 8;

/**
 * Convierte toques y clics del canvas en intents. Un arrastre (más de 8 px) es para la cámara
 * y no genera ninguna acción. El clic derecho siempre quita.
 */
export class PointerInput {
  private pointerDown = new THREE.Vector2();
  private dragging = false;

  constructor(
    canvas: HTMLCanvasElement,
    private camera: THREE.Camera,
    private toVoxelSpace: (v: THREE.Vector3) => { x: number; y: number; z: number },
    private send: (intent: Intent) => void,
  ) {
    canvas.addEventListener("pointerdown", (event) => {
      this.pointerDown.set(event.clientX, event.clientY);
      this.dragging = false;
    });

    canvas.addEventListener("pointermove", (event) => {
      if (event.buttons === 0) return;
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) this.dragging = true;
    });

    canvas.addEventListener("pointerup", (event) => {
      if (this.dragging) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.send({ type: "use", ray: this.rayFromNdc(ndc), forceRemove: event.button === 2 });
    });

    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  private rayFromNdc(ndc: THREE.Vector2): Ray {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const d = raycaster.ray.direction;
    return { origin: this.toVoxelSpace(raycaster.ray.origin), direction: { x: d.x, y: d.y, z: d.z } };
  }
}
