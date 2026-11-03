import { defineConfig } from "vite";

export default defineConfig({
  server: {
    watch: {
      // Static PDF fonts stay available, but do not need hot-reload watching.
      // Windows can lock TTF files while previewing or scanning them.
      ignored: ["**/public/brand/rutahogar/fonts/**"],
    },
  },
  build: {
    outDir: "dist",
  },
});
