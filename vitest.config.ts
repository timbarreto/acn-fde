import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: [
      "src/**/*.test.{ts,tsx}",
      "worker/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    exclude: [
      "worker/**/*.worker.test.ts",
      "scripts/**/*.integration.test.ts",
    ],
  },
})
