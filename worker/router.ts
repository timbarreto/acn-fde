export type RequestHandler = (request: Request) => Promise<Response>

export interface RequestHandlers {
  coreEx: RequestHandler
  assets: RequestHandler
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
