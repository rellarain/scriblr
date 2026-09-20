import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feedbackApi } from './feedbackApi'
import { changeFeedback, getFeedbackState, loadFeedback, resetFeedbackStore, setFeedbackAdmin } from './feedbackStore'
import { bundle } from './inboxTestData'

// The test environment has no fetch: a stand-in that answers like the server.
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: 'x', json: async () => body })
const stubFetch = (impl: (url: string, init: RequestInit) => unknown) => {
  const mock = vi.fn(async (url: string, init: RequestInit) => impl(url, init))
  vi.stubGlobal('fetch', mock)
  return mock
}

beforeEach(() => { resetFeedbackStore('adm-lee') })
afterEach(() => { vi.unstubAllGlobals() })

describe('feedback store', () => {
  it('loads the bundle as the signed-in admin', async () => {
    const fetchMock = stubFetch(() => reply(bundle({ me: 'adm-lee' })))
    await loadFeedback()
    expect(fetchMock).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'X-Admin-Id': 'adm-lee' }) }))
    expect(getFeedbackState().status).toBe('ready')
    expect(getFeedbackState().adminId).toBe('adm-lee')
  })

  it('adopts the server admin when none was chosen', async () => {
    resetFeedbackStore('')
    stubFetch(() => reply(bundle({ me: 'adm-dana' })))
    await loadFeedback()
    expect(getFeedbackState().adminId).toBe('adm-dana')
  })

  it('reloads for another admin when the signed-in admin changes', async () => {
    const fetchMock = stubFetch(() => reply(bundle({ me: 'adm-sam' })))
    setFeedbackAdmin('adm-sam')
    await vi.waitFor(() => expect(getFeedbackState().status).toBe('ready'))
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { 'X-Admin-Id': 'adm-sam' } })
    expect(getFeedbackState().adminId).toBe('adm-sam')
  })

  it('sends changes one at a time, in order', async () => {
    const order: string[] = []
    stubFetch(async (_url, init) => {
      const body = JSON.parse(String(init.body))
      order.push(`start ${body.n}`)
      await new Promise(r => setTimeout(r, body.n === 1 ? 20 : 0))
      order.push(`end ${body.n}`)
      return reply(bundle())
    })
    const send = (n: number) => changeFeedback(admin => feedbackApi.voteCase(admin, 'c', { n } as never))
    await Promise.all([send(1), send(2)])
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2'])
  })

  it('keeps the bundle and shows the message from the server when a change is refused', async () => {
    stubFetch(() => reply(bundle()))
    await loadFeedback()
    stubFetch(() => reply({ detail: 'Voting needs feedback processing access to Writer > Shelf.' }, 403))
    const ok = await changeFeedback(admin => feedbackApi.voteCase(admin, 'c', { approve: true, deny: false, approveNote: '', denyNote: '' }))
    expect(ok).toBe(false)
    expect(getFeedbackState().error).toBe('Voting needs feedback processing access to Writer > Shelf.')
    expect(getFeedbackState().bundle).not.toBeNull()
  })
})
