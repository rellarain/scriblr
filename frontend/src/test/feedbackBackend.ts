import { vi } from 'vitest'
import { createMockChannels } from '../designSystem/mockChannels'
import { createMockFeedback } from '../designSystem/mockFeedback'

// A stand-in for the feedback and Project Plan routes (`/api/feedback...`, `/api/project-plan...`) and the channel list (`/api/channels`, `/api/resources`) for tests: the
// same pretend stores the design system uses (designSystem/mockFeedback.ts, mockChannels.ts), so a test drives a Help tile, the
// Inbox or an Office page against answers shaped like the server's. The acting admin comes from the X-Admin-Id header, as on the
// server. `calls` lists every request as "METHOD /path".
export function feedbackBackend() {
  const feedback = createMockFeedback()
  const channels = createMockChannels()
  const calls: string[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = String(input).replace(/^\/api/, '')
    calls.push(`${method} ${path}`)
    const [bare, search = ''] = path.split('?')
    const parts = bare.split('/').filter(Boolean).map(decodeURIComponent)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const headers = new Headers(init?.headers)
    const answer = parts[0] === 'feedback'
      ? feedback.route(method, parts.slice(1), body, new URLSearchParams(search), headers.get('X-Admin-Id') ?? '')
      : parts[0] === 'project-plan' ? feedback.planRoute(method, parts.slice(1), body, headers.get('X-Admin-Id') ?? '')
      : parts[0] === 'channels' ? channels.channels()
      : parts[0] === 'resources' ? channels.resources(method, parts.slice(1), body)
      : { status: 404, body: { detail: `unexpected ${method} ${path}` } }
    return { ok: answer.status < 400, status: answer.status, statusText: answer.status < 400 ? 'OK' : 'Error', json: async () => answer.body }
  })
  vi.stubGlobal('fetch', fn)
  return { fetch: fn, calls }
}
