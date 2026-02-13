import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  define: {
    PACKAGE_VERSION: JSON.stringify(pkg.version),
  },
});
