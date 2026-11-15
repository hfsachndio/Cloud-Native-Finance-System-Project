import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the Vite server forwards /api to the gateway.
// In production the gateway serves this app from its wwwroot folder.
// `--mode demo` builds a backend-free static demo into web/dist.
// `--mode vercel` builds into web/dist for Vercel, where api/index.js (Turso) serves /api.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:5100" } },
  preview: { proxy: { "/api": "http://localhost:5100" } },
  build: mode === "demo" || mode === "vercel"
    ? { outDir: "dist", emptyOutDir: true }
    : { outDir: "../src/FinTrack.Gateway/wwwroot", emptyOutDir: true },
}));
