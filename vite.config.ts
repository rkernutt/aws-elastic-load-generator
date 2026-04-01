import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    // Forward /proxy/* to the local bulk proxy (run `node proxy.cjs` on port 3001).
    proxy: {
      "/proxy": {
        target: `http://${process.env.PROXY_HOST || "127.0.0.1"}:${process.env.PROXY_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
          if (id.includes("/generators/traces/")) return "gen-traces";
          if (id.includes("/generators/metrics/")) return "gen-metrics";
          if (id.includes("/generators/")) return "gen-logs";
        },
      },
    },
  },
});
