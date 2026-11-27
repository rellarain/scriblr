import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportTool, slug } from './ExportTool'

// The Preview's Export tool: what to export (the project, this book, this chapter), the format (PDF, EPUB, JSON), that format's options,
// and the file it saves; the export itself is the backend's (GET /api/projects/{id}/export).

const BOOK = { id: 'b1', title: 'The Lantern Road', number: 1, chapterCount: 14 }
const CHAPTER = { id: 'c3', title: 'The Ferry at Dusk', number: 3 }

let saved: string[]
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  saved = []
  fetchMock = vi.fn(async (_url: string) => ({ ok: true, status: 200, statusText: 'OK', blob: async () => new Blob(['%PDF']), json: async () => ({}) }))
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push(this.download) })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function tool(props: Partial<Parameters<typeof ExportTool>[0]> = {}) {
  return render(<ExportTool projectId="p1" projectTitle="Harbour Lights" bookCount={3} book={BOOK} chapter={CHAPTER} {...props} />)
}

const asked = () => {
  const url = new URL(fetchMock.mock.calls.at(-1)?.[0] as string, 'http://x')
  return { path: url.pathname, ...Object.fromEntries(url.searchParams) }
}

async function exportIt() {
  fireEvent.click(screen.getByRole('button', { name: 'Export' }))
  await waitFor(() => expect(saved.length).toBeGreaterThan(0))
}

describe('the Export tool', () => {
  it('offers the project, this book and this chapter, and the three formats; this book as a PDF to begin with', () => {
    tool()
    expect(screen.getByRole('button', { name: /The project.*Harbour Lights · 3 books/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /This book.*Book 1 · The Lantern Road · 14 chapters/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /This chapter.*Chapter 3 · The Ferry at Dusk/ })).toBeTruthy()
    for (const name of ['PDF', 'EPUB', 'JSON']) expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^PDF/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('the-lantern-road.pdf')).toBeTruthy()
  })

  it("exports this book's PDF with the options chosen", async () => {
    tool()
    fireEvent.change(screen.getByLabelText('Page size'), { target: { value: 'a5' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Title page' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Revision flags in the margin' }))
    await exportIt()
    expect(asked()).toEqual({
      path: '/api/projects/p1/export', scope: 'book', id: 'b1', format: 'pdf',
      pageSize: 'a5', titlePage: 'false', contents: 'true', footnotes: 'true', marginFlags: 'true',
    })
    expect(saved).toEqual(['the-lantern-road.pdf'])
  })

  it('names a chapter by its book and number, and has no contents option for it', async () => {
    tool()
    fireEvent.click(screen.getByRole('button', { name: /This chapter/ }))
    expect(screen.getByText('the-lantern-road-chapter-3.pdf')).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Contents' })).toBeNull()
    await exportIt()
    expect(asked()).toMatchObject({ scope: 'chapter', id: 'c3', format: 'pdf' })
  })

  it('makes a project of several books a file per book (a zip) or one file with every book', async () => {
    tool()
    fireEvent.click(screen.getByRole('button', { name: /The project/ }))
    fireEvent.click(screen.getByRole('button', { name: /^EPUB/ }))
    expect(screen.getByRole('button', { name: 'A file per book' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('harbour-lights.zip')).toBeTruthy()
    expect(screen.getByText('an EPUB for each book')).toBeTruthy()
    await exportIt()
    expect(asked()).toEqual({ path: '/api/projects/p1/export', scope: 'project', format: 'epub', cover: 'true', contents: 'true', footnotes: 'true', split: 'true' })
    fireEvent.click(screen.getByRole('button', { name: 'One file with every book' }))
    expect(screen.getByText('harbour-lights.epub')).toBeTruthy()
    await exportIt()
    expect(asked()).toMatchObject({ split: 'false' })
    expect(saved).toEqual(['harbour-lights.zip', 'harbour-lights.epub'])
  })

  it('has no file-per-book choice for a project of one book, or for JSON', () => {
    tool({ bookCount: 1 })
    fireEvent.click(screen.getByRole('button', { name: /The project/ }))
    expect(screen.queryByRole('group', { name: 'How many files' })).toBeNull()
    expect(screen.getByText('harbour-lights.pdf')).toBeTruthy()
  })

  it('exports JSON with the plot, the flags and, when asked, the chapter revisions', async () => {
    tool()
    fireEvent.click(screen.getByRole('button', { name: /^JSON/ }))
    expect(screen.queryByLabelText('Page size')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chapter revisions' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Plot' }))
    await exportIt()
    expect(asked()).toEqual({ path: '/api/projects/p1/export', scope: 'book', id: 'b1', format: 'json', plot: 'false', flags: 'true', revisions: 'true' })
    expect(saved).toEqual(['the-lantern-road.json'])
  })

  it('remembers the choices', () => {
    const first = tool()
    fireEvent.click(screen.getByRole('button', { name: /^EPUB/ }))
    fireEvent.click(screen.getByRole('button', { name: /This chapter/ }))
    first.unmount()
    tool()
    expect(screen.getByRole('button', { name: /^EPUB/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('the-lantern-road-chapter-3.epub')).toBeTruthy()
  })

  it('offers no book for a chapter outside any book, and names the file after the chapter', () => {
    tool({ book: null })
    expect(screen.queryByRole('button', { name: /This book/ })).toBeNull()
    expect(screen.getByRole('button', { name: /This chapter/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('the-ferry-at-dusk.pdf')).toBeTruthy()
  })

  it('shows why an export failed, and saves nothing', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 404, statusText: 'Not Found', blob: async () => new Blob([]), json: async () => ({ detail: 'outline node not found' }) }))
    tool()
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect((await screen.findByRole('alert')).textContent).toBe('outline node not found')
    expect(saved).toEqual([])
    expect(screen.getByRole('button', { name: 'Export' })).toHaveProperty('disabled', false)
  })
})

describe('a file name from a title', () => {
  it('drops accents and punctuation, and keeps the letters of any script', () => {
    expect(slug('Café — L’été, “Part 2”')).toBe('cafe-l-ete-part-2')
    expect(slug('渡し守の夜')).toBe('渡し守の夜')
    expect(slug('नमस्ते दुनिया')).toBe('नमस्ते-दुनिया')
    expect(slug('한국어 제목')).toBe('한국어-제목')
    expect(slug('  ?!  ')).toBe('untitled')
  })
})
