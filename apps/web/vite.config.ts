import { defineConfig } from "vite";

export default defineConfig({
  // The world worker loads saved tiles on demand, which needs a module worker.
  worker: { format: "es" },
  // three.js alone is about 600 kB before compression; that is expected.
  build: { chunkSizeWarningLimit: 800 },
});
