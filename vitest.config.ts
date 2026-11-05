import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
    // bcrypt at production cost would make the suite unbearably slow.
    env: { BCRYPT_ROUNDS: "4" },
    testTimeout: 30_000,
  },
});
