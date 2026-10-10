/**
 * El dragón nocturno (spec enemigos-nocturnos): pasa una vez por noche, a mitad de la noche, quema
 * 2 árboles naturales y se come 1 cerdo-gallina libre. Nunca toca lo construido ni al personaje.
 */
export const DRAGON = {
  halfWidth: 1.3,
  height: 1.4,
  /** Bloques por segundo al volar de un punto a otro. */
  speed: 8,
  /** Sube o baja como mucho a esta velocidad (vuelo suave, sin picadas bruscas). */
  climbSpeed: 6,
  /** Altura sobre el suelo al viajar. */
  cruiseHeight: 9,
  /** Aparece a esta distancia del personaje y da vueltas a su alrededor para que el niño lo vea. */
  enterDistance: 48,
  circleRadius: 12,
  circleMs: 20_000,
  /** Sobre cada árbol: un momento de fuego antes de que el árbol desaparezca. */
  burnMs: 2000,
  burnHeight: 4,
  treesPerNight: 2,
  /** Entre los árboles más cercanos al niño (así lo ve pasar). */
  treeChoices: 6,
  /** Se come al cerdo-gallina al pasar así de cerca. */
  eatRange: 2.5,
  seekMs: 20_000,
  exitMs: 8000,
  hitsToDefeat: 5,
} as const;
