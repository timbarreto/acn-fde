import { betterAuth } from "better-auth"
import { testUtils } from "better-auth/plugins"
import {
  createAuthOptions,
  type AuthConfiguration,
} from "./auth"

interface TestIdentityRequest {
  name: string
}

interface IdentityTokenResponse {
  token: string
}

export async function issueTestIdentity(
  request: Request,
  configuration: AuthConfiguration,
): Promise<Response> {
  const input = await readIdentityRequest(request)
  if (input instanceof Response) return input

  const options = createAuthOptions(configuration)
  const auth = betterAuth({
    ...options,
    plugins: [...(options.plugins ?? []), testUtils()],
  })
  const context = await auth.$context
  const subject = crypto.randomUUID()
  const recoveryId = crypto.randomUUID()
  const user = context.test.createUser({
    id: subject,
    name: input.name,
    email: `${subject}@example.test`,
    githubAccountId: recoveryId,
  })

  await context.test.saveUser(user)
  const login = await context.test.login({ userId: subject })
  const tokenResponse = await auth.handler(
    new Request(new URL("/api/auth/token", request.url), {
      headers: login.headers,
    }),
  )

  if (!tokenResponse.ok) {
    return Response.json(
      { title: "Test identity token issuance failed", status: 500 },
      { status: 500 },
    )
  }

  const { token } = await tokenResponse.json<IdentityTokenResponse>()
  return Response.json({ subject, token }, { status: 201 })
}

async function readIdentityRequest(
  request: Request,
): Promise<TestIdentityRequest | Response> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase()
  if (mediaType !== "application/json") {
    return Response.json(
      { title: "Content-Type must be application/json", status: 415 },
      { status: 415 },
    )
  }

  try {
    const body = await request.json<unknown>()
    if (
      typeof body !== "object" ||
      body === null ||
      !("name" in body) ||
      typeof body.name !== "string" ||
      body.name.trim().length === 0 ||
      body.name.length > 100
    ) {
      throw new Error("Invalid test identity request")
    }

    return { name: body.name.trim() }
  } catch {
    return Response.json(
      { title: "Invalid test identity request", status: 400 },
      { status: 400 },
    )
  }
}
