import * as THREE from "three";
import type { BlockMaterials } from "./blockMaterial";

const DAY = new THREE.Color(0x87ceeb);
const NIGHT = new THREE.Color(0x0b1030);

/** Color del cielo, niebla y brillo del terreno según la luz del día (0 = noche, 1 = día). */
export class Sky {
  readonly fog: THREE.Fog;
  private color = new THREE.Color();

  constructor(
    private scene: THREE.Scene,
    private materials: BlockMaterials,
    viewDistance: number,
  ) {
    this.fog = new THREE.Fog(DAY.getHex(), viewDistance * 0.6, viewDistance);
    scene.fog = this.fog;
    this.setDaylight(1);
  }

  setDaylight(daylight: number): void {
    const d = Math.max(0, Math.min(1, daylight));
    this.color.copy(NIGHT).lerp(DAY, d);
    this.scene.background = this.color;
    this.fog.color.copy(this.color);
    this.materials.daylight.value = d;
  }
}
