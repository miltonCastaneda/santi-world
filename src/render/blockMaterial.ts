import * as THREE from "three";
import { TILE_NAMES } from "./tiles";
import { generateTiles, TILE_SIZE } from "./textures";

export type BlockMaterials = {
  opaque: THREE.MeshBasicMaterial;
  water: THREE.MeshBasicMaterial;
  /** 1 = pleno día, 0 = noche. Lo mueve el ciclo día/noche sin regenerar geometría. */
  daylight: { value: number };
  texture: THREE.DataArrayTexture;
  dispose(): void;
};

/** Brillo mínimo de noche para que el niño siempre vea dónde está. */
export const MIN_NIGHT_LIGHT = 0.18;

export function createTileTexture(): THREE.DataArrayTexture {
  const texture = new THREE.DataArrayTexture(generateTiles(), TILE_SIZE, TILE_SIZE, TILE_NAMES.length);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function patch(material: THREE.MeshBasicMaterial, tiles: THREE.DataArrayTexture, daylight: { value: number }, alphaTest: boolean): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTiles = { value: tiles };
    shader.uniforms.uDaylight = daylight;
    shader.uniforms.uMinLight = { value: MIN_NIGHT_LIGHT };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec2 tileUv;
attribute float tileLayer;
attribute vec3 shade;
varying vec2 vTileUv;
varying float vLayer;
varying vec3 vShade;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vTileUv = tileUv;
vLayer = tileLayer;
vShade = shade;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform highp sampler2DArray uTiles;
uniform float uDaylight;
uniform float uMinLight;
varying vec2 vTileUv;
varying float vLayer;
varying vec3 vShade;`,
      )
      .replace(
        "#include <map_fragment>",
        `vec4 texel = texture(uTiles, vec3(vTileUv, floor(vLayer + 0.5)));
${alphaTest ? "if (texel.a < 0.5) discard;" : ""}
float skyL = vShade.y * uDaylight;
float torchL = vShade.z;
float lightL = max(max(skyL, torchL), uMinLight);
vec3 torchTint = mix(vec3(1.0), vec3(1.0, 0.85, 0.6), clamp(torchL - skyL, 0.0, 1.0));
diffuseColor.rgb *= texel.rgb * vShade.x * lightL * torchTint;`,
      );
  };
  material.customProgramCacheKey = () => `santi-block-${alphaTest ? "cutout" : "water"}`;
}

/** Materiales del terreno: opaco (con recorte para las hojas) y agua transparente. */
export function createBlockMaterials(): BlockMaterials {
  const texture = createTileTexture();
  const daylight = { value: 1 };
  const opaque = new THREE.MeshBasicMaterial({ color: 0xffffff });
  patch(opaque, texture, daylight, true);
  const water = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false });
  patch(water, texture, daylight, false);
  return {
    opaque,
    water,
    daylight,
    texture,
    dispose() {
      opaque.dispose();
      water.dispose();
      texture.dispose();
    },
  };
}
