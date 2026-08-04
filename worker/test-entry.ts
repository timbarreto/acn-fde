import worker from "./index"

export default {
  fetch(request, env): Promise<Response> {
    return worker.fetch(request, env)
  },
} satisfies ExportedHandler<Cloudflare.Env>
