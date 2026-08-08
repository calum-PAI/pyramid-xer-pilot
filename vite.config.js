import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// App version — single source of truth is package.json, exposed to the client
// as __APP_VERSION__ (avoids bundling the whole package.json).
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 5178, host: true },
});
