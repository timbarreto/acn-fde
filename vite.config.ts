import { defineConfig } from "vite"
import { cloudflare } from "@cloudflare/vite-plugin"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig(() => {
  const fullStack = process.env.ACN_FDE_FULL_STACK === "true"
  const integration = process.env.ACN_FDE_INTEGRATION === "true"
  const workerConfigPath =
    process.env.ACN_FDE_WORKER_CONFIG ?? "./wrangler.local.jsonc"
  const workerStatePath = process.env.ACN_FDE_WORKER_STATE

  const integrationWorkerOptions = integration
    ? {
        persistState: { path: requiredEnvironment("ACN_FDE_WORKER_STATE") },
        config: {
          vars: {
            COREEX_API_ORIGIN: requiredEnvironment("COREEX_API_ORIGIN"),
            BETTER_AUTH_URL: requiredEnvironment("BETTER_AUTH_URL"),
            AUTH_TOKEN_ISSUER: requiredEnvironment("AUTH_TOKEN_ISSUER"),
            AUTH_TOKEN_AUDIENCE: requiredEnvironment("AUTH_TOKEN_AUDIENCE"),
            GITHUB_CLIENT_ID: requiredEnvironment("GITHUB_CLIENT_ID"),
            GITHUB_CLIENT_SECRET: requiredEnvironment("GITHUB_CLIENT_SECRET"),
            BETTER_AUTH_SECRET: requiredEnvironment("BETTER_AUTH_SECRET"),
          },
        },
      }
    : {
        persistState: workerStatePath ? { path: workerStatePath } : true,
      }

  return {
    define: {
      "import.meta.env.ACN_FDE_FULL_STACK": JSON.stringify(fullStack),
    },
    plugins: [
      ...(fullStack
        ? [
            cloudflare({
              configPath: workerConfigPath,
              remoteBindings: false,
              ...integrationWorkerOptions,
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

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the integration stack`)
  return value
}
