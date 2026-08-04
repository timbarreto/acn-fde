import worker from "./index"
import { issueTestIdentity } from "./test-auth"

const testIdentityPath = "/api/test-auth/identity"

export default {
  fetch(request, env): Promise<Response> {
    const pathname = new URL(request.url).pathname

    if (pathname === testIdentityPath && request.method === "POST") {
      return issueTestIdentity(request, env)
    }

    if (pathname === "/api/test-auth" || pathname.startsWith("/api/test-auth/")) {
      return Promise.resolve(
        Response.json(
          { title: "Not found", status: 404 },
          { status: 404 },
        ),
      )
    }

    return worker.fetch(request, env)
  },
} satisfies ExportedHandler<Env>
