import { defineConfig } from "vite";

export default defineConfig({
  // The world worker loads saved tiles on demand, which needs a module worker.
  worker: { format: "es" },
  // Two big files are expected: three.js (about 600 kB) and the Rapier physics engine
  // (about 4.4 MB before compression, 1.6 MB after), which loads as its own file.
  build: { chunkSizeWarningLimit: 4600 },
});
