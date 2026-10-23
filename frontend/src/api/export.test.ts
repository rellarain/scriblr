// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { exportBookPdf, exportChapterPdf } from './export'

// A PDF download: fetched as a Blob (the JSON client cannot), handed to the browser through a temporary link, and the link and the object
// URL removed after.

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

describe('api: downloading a PDF', () => {
  it('asks for the book\'s export, and saves it under the name given', async () => {
    const fetchMock = answer()
    await exportBookPdf('p1', 'b1', 'My book.pdf')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p1/export/book/b1')
    expect(clicked).toHaveLength(1)
    expect(clicked[0].getAttribute('download')).toBe('My book.pdf')
    expect(clicked[0].getAttribute('href')).toBe('blob:the-pdf')
  })

  it('asks for the chapter\'s export', async () => {
    const fetchMock = answer()
    await exportChapterPdf('p1', 'c1', 'Chapter.pdf')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p1/export/chapter/c1')
    expect(clicked[0].getAttribute('download')).toBe('Chapter.pdf')
  })

  it('leaves no link in the page and frees the object URL', async () => {
    answer()
    await exportBookPdf('p1', 'b1', 'a.pdf')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:the-pdf')
  })

  it('raises an ApiError with the backend\'s explanation, and downloads nothing', async () => {
    answer({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({ detail: 'No such book' }) })
    const error = await exportBookPdf('p1', 'gone', 'a.pdf').catch(e => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'No such book' })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(clicked).toHaveLength(0)
  })

  it('falls back to the status text when the failure has no JSON body', async () => {
    answer({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => { throw new SyntaxError('not json') } })
    const error = await exportChapterPdf('p1', 'c1', 'a.pdf').catch(e => e)
    expect(error).toMatchObject({ status: 500, message: 'Internal Server Error' })
  })
})
