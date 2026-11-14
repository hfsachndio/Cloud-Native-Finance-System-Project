import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the Vite server forwards /api to the gateway.
// In production the gateway serves this app from its wwwroot folder.
// `--mode demo` builds a standalone static demo into web/dist (used for Vercel).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:5100" } },
  build: mode === "demo"
    ? { outDir: "dist", emptyOutDir: true }
    : { outDir: "../src/FinTrack.Gateway/wwwroot", emptyOutDir: true },
}));
