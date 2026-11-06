import { vi } from 'vitest'
import type { ItemDoc } from '../api/types'
import { createMockItems } from '../designSystem/mockItems'

// A stand-in for the Items API (`/api/projects/{id}/items`) for tests: the library is kept in memory by the same pretend API the design system uses
// (designSystem/mockItems.ts). `calls` lists every request as "METHOD /path"; anything else the page asks for is answered by `other(path)` (an empty list by default).

export interface ItemsBackend {
  fetch: ReturnType<typeof vi.fn>
  readonly items: Map<string, ItemDoc>
  calls: string[]
  of(method: string): string[]
}

export function itemsBackend(initial: ItemDoc[] = [], other: (path: string) => unknown = () => []): ItemsBackend {
  const mock = createMockItems(initial)
  const calls: string[] = []
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', json: async () => body, text: async () => JSON.stringify(body ?? null) })

  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = String(url).replace(/^\/api/, '')
    calls.push(`${method} ${path}`)
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts[0] !== 'projects' || parts[2] !== 'items') return reply(200, other(path))
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const answer = mock.route(method, parts.slice(3), body)
    return reply(answer.status, answer.body)
  })
  vi.stubGlobal('fetch', fn)

  return { fetch: fn, calls, get items() { return mock.items }, of: method => calls.filter(c => c.startsWith(`${method} `)) }
}
