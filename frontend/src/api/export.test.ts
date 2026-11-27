// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { exportFile, exportUrl } from './export'

// An export download (PDF, EPUB, JSON or a zip): fetched as a Blob (the JSON client cannot), handed to the browser through a temporary link,
// and the link and the object URL removed after.

let clicked: HTMLAnchorElement[]

beforeEach(() => {
  clicked = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    // What the browser would be given at the moment of the click.
    clicked.push(this.cloneNode() as HTMLAnchorElement)
    expect(document.body.contains(this)).toBe(true)
  })
  URL.createObjectURL = vi.fn(() => 'blob:the-pdf')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { vi.restoreAllMocks() })

function answer(init: { ok?: boolean; status?: number; statusText?: string; json?: () => Promise<unknown> } = {}) {
  const fn = vi.fn(async (_url: string) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    json: init.json ?? (async () => ({})),
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('api: the export address', () => {
  it('names the scope, the target and the format, and only the options given', () => {
    expect(exportUrl('p1', { scope: 'book', id: 'b1', format: 'pdf' })).toBe('/api/projects/p1/export?scope=book&format=pdf&id=b1')
    const url = new URL(exportUrl('p 1', { scope: 'project', format: 'epub', options: { split: true, contents: false, footnotes: undefined } }), 'http://x')
    expect(url.pathname).toBe('/api/projects/p%201/export')
    expect(Object.fromEntries(url.searchParams)).toEqual({ scope: 'project', format: 'epub', split: 'true', contents: 'false' })
  })
})

describe('api: downloading an export', () => {
  it('asks for the export, and saves it under the name given', async () => {
    const fetchMock = answer()
    await exportFile('p1', { scope: 'chapter', id: 'c1', format: 'pdf', options: { pageSize: 'a5' } }, 'the-lantern-road-chapter-3.pdf')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p1/export?scope=chapter&format=pdf&id=c1&pageSize=a5')
    expect(clicked).toHaveLength(1)
    expect(clicked[0].getAttribute('download')).toBe('the-lantern-road-chapter-3.pdf')
    expect(clicked[0].getAttribute('href')).toBe('blob:the-pdf')
  })

  it('leaves no link in the page and frees the object URL', async () => {
    answer()
    await exportFile('p1', { scope: 'project', format: 'json' }, 'a.json')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:the-pdf')
  })

  it("raises an ApiError with the backend's explanation, and downloads nothing", async () => {
    answer({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({ detail: 'No such book' }) })
    const error = await exportFile('p1', { scope: 'book', id: 'gone', format: 'epub' }, 'a.epub').catch(e => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'No such book' })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(clicked).toHaveLength(0)
  })

  it('falls back to the status text when the failure has no JSON body, or no words in it', async () => {
    answer({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => { throw new SyntaxError('not json') } })
    expect(await exportFile('p1', { scope: 'chapter', id: 'c1', format: 'pdf' }, 'a.pdf').catch(e => e)).toMatchObject({ status: 500, message: 'Internal Server Error' })
    answer({ ok: false, status: 422, statusText: 'Unprocessable Entity', json: async () => ({ detail: [{ msg: 'bad' }] }) })
    expect(await exportFile('p1', { scope: 'chapter', format: 'pdf' }, 'a.pdf').catch(e => e)).toMatchObject({ status: 422, message: 'Unprocessable Entity' })
  })
})
