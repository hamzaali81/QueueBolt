import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    minify: false,
  },
  {
    entry: {
      "backends/redis": "src/backends/redis.ts",
      "backends/sqlite": "src/backends/sqlite.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    external: ["ioredis", "better-sqlite3"],
  },
]);
