import { getContainer } from "@cloudflare/containers"
import { handleAuthRequest } from "./auth"
import { CoreExContainer } from "./coreex-container"
import { guardPracticeStateRequest } from "./practice-state"
import { routeRequest, toCoreExRequest } from "./router"

export { CoreExContainer }

export default {
  async fetch(request, env): Promise<Response> {
    const guarded = await guardPracticeStateRequest(request)
    if (guarded instanceof Response) return guarded

    return routeRequest(guarded, {
      auth: (incoming) => handleAuthRequest(incoming, env),
      coreEx: (incoming) => proxyCoreEx(incoming, env),
      assets: (incoming) => env.ASSETS.fetch(incoming),
    })
  },
} satisfies ExportedHandler<Env>

async function proxyCoreEx(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (env.COREEX) {
      return await getContainer(env.COREEX, "api").fetch(request)
    }
    if (env.COREEX_API_ORIGIN) {
      return await fetch(toCoreExRequest(request, env.COREEX_API_ORIGIN))
    }
    throw new Error("No CoreEx backend is configured.")
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "CoreEx proxy request failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    )

    return Response.json(
      {
        title: "CoreEx is unavailable",
        status: 502,
      },
      { status: 502 },
    )
  }
}
