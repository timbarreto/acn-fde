import { createAuth } from "./auth"

export default {
  fetch(request, env): Promise<Response> {
    return createAuth(env).handler(request)
  },
} satisfies ExportedHandler<Cloudflare.Env>
