import { defineConfig } from "vite";

// FixGuide AI — Even Hub app (Vite + TypeScript).
// host: true lets the Even phone app / simulator reach the dev server on LAN.
// The /api proxy forwards to the local backend (server/server.mjs) in dev.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    target: "esnext",
  },
});
