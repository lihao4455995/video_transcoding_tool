import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main/main.ts",
    preload: "src/preload/preload.ts",
    "keygen-main": "src/keygen/keygen-main.ts",
  },
  format: ["cjs"],
  target: "es2022",
  outDir: "dist-electron",
  clean: true,
  sourcemap: true,
  external: ["electron"],
});
