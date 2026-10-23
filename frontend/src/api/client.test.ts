import { describe, expect, it, vi } from 'vitest'
import { ApiError, api } from './client'

// The one JSON client every call to the backend goes through: the request it makes and how it reports a failure.

interface Reply { ok?: boolean; status?: number; statusText?: string; json?: () => Promise<unknown> }

function reply(r: Reply = {}) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: r.ok ?? true,
    status: r.status ?? 200,
    statusText: r.statusText ?? 'OK',
    json: r.json ?? (async () => ({ ok: true })),
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

// What a call that is expected to fail raised.
async function failure(call: Promise<unknown>): Promise<ApiError> {
  try { await call } catch (error) { return error as ApiError }
  throw new Error('The call did not fail')
}

describe('api: the request', () => {
  it('asks under /api, for JSON, and sends nothing with a GET', async () => {
    const fetchMock = reply()
    await api.get('/projects')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/projects')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init?.method).toBeUndefined()
    expect(init?.body).toBeUndefined()
  })

  it('sends a body as JSON with the verb that was asked for', async () => {
    const fetchMock = reply()
    await api.post('/projects', { title: 'A' })
    await api.put('/projects/p/outline', { nodes: [] })
    await api.patch('/projects/p', { themeHue: 3 })
    await api.delete('/projects/p')
    const sent = fetchMock.mock.calls.map(([, init]) => [init?.method, init?.body])
    expect(sent).toEqual([
      ['POST', '{"title":"A"}'],
      ['PUT', '{"nodes":[]}'],
      ['PATCH', '{"themeHue":3}'],
      ['DELETE', undefined],
    ])
  })

  it('posts without a body when none is given', async () => {
    const fetchMock = reply()
    await api.post('/projects/p/publish')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: undefined })
  })

  it('lets a save outlive the page when its body is small, and not when it is too big for that', async () => {
    const fetchMock = reply()
    await api.put('/x', { text: 'short' })
    await api.put('/x', { text: 'x'.repeat(60_000) })
    await api.get('/x')
    expect(fetchMock.mock.calls.map(([, init]) => init?.keepalive)).toEqual([true, false, false])
  })

  it('returns the JSON the backend answered with', async () => {
    reply({ json: async () => ({ a: 1 }) })
    expect(await api.get('/x')).toEqual({ a: 1 })
  })

  it('returns nothing for "no content", without reading a body', async () => {
    const json = vi.fn(async () => { throw new Error('there is no body') })
    reply({ status: 204, json })
    expect(await api.delete('/projects/p')).toBeUndefined()
    expect(json).not.toHaveBeenCalled()
  })
})

describe('api: a failure', () => {
  it('raises an ApiError with the status and the backend\'s own explanation', async () => {
    reply({ ok: false, status: 409, statusText: 'Conflict', json: async () => ({ detail: 'This project\'s file is damaged' }) })
    const error = await failure(api.get('/projects/p'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toBeInstanceOf(Error)
    expect(error.status).toBe(409)
    expect(error.message).toBe('This project\'s file is damaged')
  })

  it('falls back to the status text when the answer holds no explanation', async () => {
    reply({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({}) })
    const error = await failure(api.get('/x'))
    expect(error).toMatchObject({ status: 500, message: 'Internal Server Error' })
  })

  it('falls back to the status text when the answer is not JSON', async () => {
    reply({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => { throw new SyntaxError('Unexpected token <') } })
    const error = await failure(api.get('/x'))
    expect(error).toMatchObject({ status: 502, message: 'Bad Gateway' })
  })

  it('does not hide a request that never got an answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const error = await failure(api.get('/x'))
    expect(error).toBeInstanceOf(TypeError)
    expect(error).not.toBeInstanceOf(ApiError)
  })
})
