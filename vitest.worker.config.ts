import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers"
import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.test.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(__dirname, "worker/migrations"),
          ),
        },
      },
    })),
  ],
  test: {
    include: ["worker/**/*.worker.test.ts"],
    setupFiles: ["./worker/setup.worker.ts"],
  },
})
