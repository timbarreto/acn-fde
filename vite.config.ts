import { defineConfig } from "vite"
import { cloudflare } from "@cloudflare/vite-plugin"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig(() => {
  const fullStack = process.env.ACN_FDE_FULL_STACK === "true"
  const accountMode =
    fullStack || process.env.ACN_FDE_ACCOUNT_MODE === "true"
  const integration = process.env.ACN_FDE_INTEGRATION === "true"
  const workerConfigPath =
    process.env.ACN_FDE_WORKER_CONFIG ?? "./wrangler.local.jsonc"
  const workerStatePath = process.env.ACN_FDE_WORKER_STATE

  const workerVars: Record<string, string> = !fullStack
    ? {}
    : {
        ...(integration
          ? {
              COREEX_API_ORIGIN: requiredEnvironment("COREEX_API_ORIGIN"),
              BETTER_AUTH_URL: requiredEnvironment("BETTER_AUTH_URL"),
              AUTH_TOKEN_ISSUER: requiredEnvironment("AUTH_TOKEN_ISSUER"),
              AUTH_TOKEN_AUDIENCE: requiredEnvironment("AUTH_TOKEN_AUDIENCE"),
            }
          : {}),
        GITHUB_CLIENT_ID: requiredEnvironment("GITHUB_CLIENT_ID"),
        GITHUB_CLIENT_SECRET: requiredEnvironment("GITHUB_CLIENT_SECRET"),
        BETTER_AUTH_SECRET: requiredEnvironment("BETTER_AUTH_SECRET"),
      }
  const fullStackWorkerOptions = !fullStack
    ? {}
    : {
        persistState: integration
          ? { path: requiredEnvironment("ACN_FDE_WORKER_STATE") }
          : workerStatePath ? { path: workerStatePath } : true,
        config: { vars: workerVars },
      }

  return {
    define: {
      "import.meta.env.ACN_FDE_FULL_STACK": JSON.stringify(accountMode),
    },
    plugins: [
      ...(fullStack
        ? [
            cloudflare({
              configPath: workerConfigPath,
              remoteBindings: false,
              ...fullStackWorkerOptions,
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
    server: integration
      ? { allowedHosts: ["aspire.dev.internal"] }
      : undefined,
  }
})

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the integration stack`)
  return value
}
