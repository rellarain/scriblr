import { vi } from 'vitest'

// A stand-in for `fetch` that answers every request with `body` (JSON, status 200 unless given). Replaces the copy-pasted
// `vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))`; the global setup unstubs it
// after each test. Returns the mock so a test can look at the calls.
export function mockFetch(body: unknown = {}, init: { ok?: boolean; status?: number } = {}) {
  const fn = vi.fn(async () => ({ ok: init.ok ?? true, status: init.status ?? 200, json: async () => body, text: async () => JSON.stringify(body) }))
  vi.stubGlobal('fetch', fn)
  return fn
}

// The same, with an answer per request: `answer(url, init)` returns the JSON body.
export function mockFetchBy(answer: (url: string, init?: RequestInit) => unknown) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, status: 200, json: async () => answer(String(url), init) }))
  vi.stubGlobal('fetch', fn)
  return fn
}
