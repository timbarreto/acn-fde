import { defineConfig } from "vite"
import { cloudflare } from "@cloudflare/vite-plugin"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig(() => {
  const fullStack = process.env.ACN_FDE_FULL_STACK === "true"

  return {
    plugins: [
      ...(fullStack
        ? [
            cloudflare({
              configPath: "./wrangler.local.jsonc",
              remoteBindings: false,
            }),
          ]
        : []),
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
