export const CHANNEL_NAME = "santi";

/** Avisos entre la pestaña del juego y la vista de padres (design D13). */
export type SantiMessage =
  | { type: "saved"; worldId: string }
  | { type: "worldsChanged" }
  | { type: "settingsChanged"; worldId: string };

export type SantiChannel = {
  post(msg: SantiMessage): void;
  onMessage(fn: (msg: SantiMessage) => void): () => void;
  close(): void;
};

/** Canal entre pestañas. Si el navegador no tiene BroadcastChannel, no avisa (sin errores). */
export function openChannel(name = CHANNEL_NAME): SantiChannel {
  if (typeof BroadcastChannel === "undefined") return { post() {}, onMessage: () => () => {}, close() {} };
  const channel = new BroadcastChannel(name);
  return {
    post: (msg) => channel.postMessage(msg),
    onMessage(fn) {
      const handler = (e: MessageEvent<SantiMessage>) => fn(e.data);
      channel.addEventListener("message", handler);
      return () => channel.removeEventListener("message", handler);
    },
    close: () => channel.close(),
  };
}
