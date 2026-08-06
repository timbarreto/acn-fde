import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["scripts/**/*.integration.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
