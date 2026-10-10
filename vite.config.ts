import { resolve } from "node:path";
import { defineConfig, type Connect, type Plugin } from "vite";

/** `/padres` (sin barra) lleva a `/padres/`, en desarrollo y en vista previa (ADR-0008). */
function parentsRedirect(): Plugin {
  const redirect: Connect.NextHandleFunction = (req, res, next) => {
    const [path, query] = (req.url ?? "").split("?");
    if (path !== "/padres") return next();
    res.statusCode = 301;
    res.setHeader("Location", `/padres/${query ? `?${query}` : ""}`);
    res.end();
  };
  return {
    name: "santi-parents-redirect",
    configureServer: (server) => void server.middlewares.use(redirect),
    configurePreviewServer: (server) => void server.middlewares.use(redirect),
  };
}

export default defineConfig({
  plugins: [parentsRedirect()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        padres: resolve(import.meta.dirname, "padres/index.html"),
      },
    },
  },
});
