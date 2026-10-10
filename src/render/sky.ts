import * as THREE from "three";
import { Rng } from "../core/rng";
import type { BlockMaterials } from "./blockMaterial";
import { DAY_SKY, skyLighting } from "./lighting";

/** Dónde está el sol (de día) o la luna (de noche): fracción de la fase que ya pasó. */
export type SkyTime = { isNight: boolean; progress: number };

const BODY_DISTANCE = 150;
const STARS = 300;

/** Sol y luna de pixel art (8x8), como el resto del mundo. */
function pixelTexture(rows: string[], colors: Record<string, string>): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const g = c.getContext("2d")!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = colors[ch];
      g.fillRect(x, y, 1, 1);
    }),
  );
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function body(texture: THREE.Texture, size: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * Cielo, niebla, sol, luna y estrellas según la hora. La luz de las entidades (hemisférica, sol y
 * luna) sigue la misma curva; el terreno la recibe por el uniforme `uDaylight`.
 */
export class Sky {
  readonly fog: THREE.Fog;
  private color = new THREE.Color();
  private readonly sun: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly group = new THREE.Group();
  private lights: { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; moon: THREE.DirectionalLight } | null = null;

  constructor(
    private scene: THREE.Scene,
    private materials: BlockMaterials,
    viewDistance: number,
  ) {
    this.fog = new THREE.Fog(DAY_SKY, viewDistance * 0.6, viewDistance);
    scene.fog = this.fog;

    this.sun = body(
      pixelTexture(["..yyyy..", ".yYYYYy.", "yYYYYYYy", "yYYYYYYy", "yYYYYYYy", "yYYYYYYy", ".yYYYYy.", "..yyyy.."], { y: "#ffb733", Y: "#ffe066" }),
      22,
    );
    this.moon = body(
      pixelTexture(["..mmmm..", ".mMMMMm.", "mMMdMMMm", "mMMMMdMm", "mMdMMMMm", "mMMMMMMm", ".mMMdMm.", "..mmmm.."], { m: "#c9d3ea", M: "#f4f6ff", d: "#b0bad4" }),
      16,
    );
    const rng = new Rng("estrellas");
    const pos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const a = rng.range(0, Math.PI * 2);
      const el = Math.asin(rng.range(0.1, 1));
      pos.set([Math.cos(a) * Math.cos(el) * BODY_DISTANCE, Math.sin(el) * BODY_DISTANCE, Math.sin(a) * Math.cos(el) * BODY_DISTANCE], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    this.stars.renderOrder = -2;
    this.sun.visible = false;
    this.moon.visible = false;
    this.group.add(this.stars, this.sun, this.moon);
    scene.add(this.group);
    this.setDaylight(1);
  }

  /** Luces de las entidades que también siguen la hora. */
  attachLights(lights: { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; moon: THREE.DirectionalLight }): void {
    this.lights = lights;
  }

  setDaylight(daylight: number): void {
    const d = Math.max(0, Math.min(1, daylight));
    const l = skyLighting(d);
    this.color.setHex(l.sky);
    this.scene.background = this.color;
    this.fog.color.copy(this.color);
    this.materials.daylight.value = d;
    (this.stars.material as THREE.PointsMaterial).opacity = l.stars;
    this.stars.visible = l.stars > 0;
    if (this.lights) {
      this.lights.hemi.intensity = l.hemi;
      this.lights.hemi.color.setHex(l.hemiColor);
      this.lights.sun.intensity = l.sun;
      this.lights.moon.intensity = l.moon;
    }
  }

  /**
   * Coloca el sol o la luna en su arco (sale por el este, +x, y se pone por el oeste) alrededor de la
   * cámara, siempre más lejos que el terreno visible.
   */
  update(camera: THREE.Camera, time: SkyTime): void {
    this.group.position.copy(camera.position);
    const a = Math.PI * (0.1 + 0.8 * Math.max(0, Math.min(1, time.progress)));
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.35).normalize().multiplyScalar(BODY_DISTANCE);
    const shown = time.isNight ? this.moon : this.sun;
    const hidden = time.isNight ? this.sun : this.moon;
    shown.visible = true;
    hidden.visible = false;
    shown.position.copy(dir);
    shown.lookAt(camera.position);
  }

  dispose(): void {
    for (const m of [this.sun, this.moon]) {
      m.geometry.dispose();
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    this.scene.remove(this.group);
  }
}
