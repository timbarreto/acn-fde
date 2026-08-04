export type RequestHandler = (request: Request) => Promise<Response>

export interface RequestHandlers {
  auth: RequestHandler
  coreEx: RequestHandler
  assets: RequestHandler
}

const authRoutes = new Set([
  "POST /api/auth/sign-in/social",
  "GET /api/auth/callback/github",
  "POST /api/auth/callback/github",
  "GET /api/auth/get-session",
  "POST /api/auth/sign-out",
  "GET /api/auth/token",
  "GET /api/auth/jwks",
  "POST /api/auth/delete-user",
])

export function isAuthPath(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/")
}

export function isEnabledAuthRequest(request: Request): boolean {
  const pathname = new URL(request.url).pathname
  return authRoutes.has(`${request.method.toUpperCase()} ${pathname}`)
}

export function isCoreExPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/health" ||
    pathname.startsWith("/health/")
  )
}

export function routeRequest(
  request: Request,
  handlers: RequestHandlers,
): Promise<Response> {
  const pathname = new URL(request.url).pathname

  if (pathname === "/api/test-auth" || pathname.startsWith("/api/test-auth/")) {
    return Promise.resolve(
      Response.json(
        { title: "Not found", status: 404 },
        { status: 404 },
      ),
    )
  }

  if (isEnabledAuthRequest(request)) return handlers.auth(request)

  if (isAuthPath(pathname)) {
    return Promise.resolve(
      Response.json(
        { title: "Not found", status: 404 },
        { status: 404 },
      ),
    )
  }

  return isCoreExPath(pathname)
    ? handlers.coreEx(request)
    : handlers.assets(request)
}

export function toCoreExRequest(
  request: Request,
  coreExOrigin: string,
): Request {
  const incomingUrl = new URL(request.url)
  const targetUrl = new URL(
    `${incomingUrl.pathname}${incomingUrl.search}`,
    coreExOrigin,
  )

  return new Request(targetUrl, request)
}
