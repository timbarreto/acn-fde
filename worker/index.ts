import { routeRequest, toCoreExRequest } from "./router"

export default {
  async fetch(request, env): Promise<Response> {
    return routeRequest(request, {
      coreEx: (incoming) => proxyCoreEx(incoming, env.COREEX_API_ORIGIN),
      assets: (incoming) => env.ASSETS.fetch(incoming),
    })
  },
} satisfies ExportedHandler<Env>

async function proxyCoreEx(
  request: Request,
  coreExOrigin: string,
): Promise<Response> {
  try {
    return await fetch(toCoreExRequest(request, coreExOrigin))
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
