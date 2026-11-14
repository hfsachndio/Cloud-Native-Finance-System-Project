import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the Vite server forwards /api to the gateway.
// In production the gateway serves this app from its wwwroot folder.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:5100" } },
  build: { outDir: "../src/FinTrack.Gateway/wwwroot", emptyOutDir: true },
});
