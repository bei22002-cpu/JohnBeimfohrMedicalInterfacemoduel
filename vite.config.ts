import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Dev convenience: run `docker compose -f infra/docker-compose.yml up` (fleet:3001, imaging:8000)
      // and keep the frontend on 5173 with same-origin paths.
      "/fleet": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/fleet/, ""),
      },
      "/imaging": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/imaging/, ""),
      },
    },
  },
});
