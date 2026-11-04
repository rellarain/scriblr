export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// What the backend's `detail` says, as text. A plain explanation is a string; a request the backend could not read (FastAPI, 422) answers with a list of
// problems, each with a `msg` (a rule of the data says "Value error, ..."), and a `loc` that ends in the field at fault: "title: String should have at least 1
// character". The first few are joined; the rest are counted.
export function detailText(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail || fallback
  const list = Array.isArray(detail) ? detail : detail && typeof detail === 'object' ? [detail] : []
  const lines: string[] = []
  for (const problem of list) {
    if (typeof problem === 'string') { lines.push(problem); continue }
    const { msg, loc } = (problem ?? {}) as { msg?: unknown; loc?: unknown }
    if (typeof msg !== 'string') continue
    const text = msg.replace(/^Value error, /, '')
    const field = Array.isArray(loc) && loc.length > 1 && typeof loc[loc.length - 1] === 'string' ? `${loc[loc.length - 1]}: ` : ''
    lines.push(`${field}${text}`)
  }
  const unique = [...new Set(lines)]
  if (unique.length === 0) return fallback
  return unique.length > 3 ? `${unique.slice(0, 3).join('; ')} (and ${unique.length - 3} more)` : unique.join('; ')
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // A request with a body outlives the page (a save started as the window closes
  // still completes); the browser caps keepalive bodies at 64KB.
  const keepalive = typeof init?.body === 'string' && init.body.length < 60_000
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    keepalive,
    ...init,
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = detailText(body.detail, detail)
    } catch {
      // response had no JSON body; fall back to statusText
    }
    throw new ApiError(response.status, detail)
  }

  // Something changed: the header's activity ribbon looks again a moment after the last change.
  if (init?.method && init.method !== 'GET' && typeof window !== 'undefined') window.dispatchEvent(new Event('scriblr:changed'))
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
