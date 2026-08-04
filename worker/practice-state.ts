const MAXIMUM_PRACTICE_STATE_BYTES = 512 * 1024

export async function guardPracticeStateRequest(
  request: Request,
): Promise<Request | Response> {
  const url = new URL(request.url)
  if (request.method !== "POST" || url.pathname !== "/api/practice-state") {
    return request
  }

  if (!hasSupportedMediaType(request)) {
    return problem(415, "Unsupported media type", "unsupported_media_type")
  }

  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_PRACTICE_STATE_BYTES) {
    return problem(413, "Practice state is too large", "practice_state_too_large")
  }

  const body = request.body
  if (!body) return request

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAXIMUM_PRACTICE_STATE_BYTES) {
      await reader.cancel()
      return problem(413, "Practice state is too large", "practice_state_too_large")
    }
    chunks.push(value)
  }

  const buffered = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffered.set(chunk, offset)
    offset += chunk.byteLength
  }

  const headers = new Headers(request.headers)
  headers.delete("content-length")
  return new Request(request, { body: buffered, headers })
}

function hasSupportedMediaType(request: Request): boolean {
  if (request.headers.has("content-encoding")) return false

  const [mediaType, ...parameters] = (request.headers.get("content-type") ?? "")
    .split(";")
    .map((part) => part.trim().toLowerCase())
  if (mediaType !== "application/json") return false

  const charset = parameters.find((parameter) => parameter.startsWith("charset="))
  return charset === undefined || charset === "charset=utf-8" || charset === "charset=\"utf-8\""
}

function problem(status: number, title: string, code: string): Response {
  return Response.json(
    {
      title,
      status,
      code,
      traceId: crypto.randomUUID(),
    },
    {
      status,
      headers: { "content-type": "application/problem+json" },
    },
  )
}
