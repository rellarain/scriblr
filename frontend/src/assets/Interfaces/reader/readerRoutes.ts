// The Reader's URLs: /read (the Nook), /read/nook/<console>, /read/library/<console>, /read/book/<id>/<console>,
// /read/book/<id>/pages/<chapter>. A console in the URL is the one open as the full console.

export type ReaderPage = 'nook' | 'library' | 'book' | 'pages'

export interface ReaderLocation {
  page: ReaderPage
  // The console open at full size (none: the page's remembered tiles).
  console: string | null
  bookId: string | null
  chapter: number | null
}

export const READER_ROOT = '/read'

const seg = (s: string) => decodeURIComponent(s)

export function parseReaderPath(pathname: string): ReaderLocation {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  const rest = parts[0] === 'read' ? parts.slice(1) : parts
  const empty: ReaderLocation = { page: 'nook', console: null, bookId: null, chapter: null }
  if (rest.length === 0) return empty
  const [head, ...tail] = rest
  if (head === 'nook' || head === 'library') return { ...empty, page: head, console: tail[0] ? seg(tail[0]) : null }
  if (head === 'book' && tail[0]) {
    const bookId = seg(tail[0])
    if (tail[1] === 'pages') {
      const chapter = Number(tail[2])
      return { page: 'pages', console: null, bookId, chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : null }
    }
    return { page: 'book', console: tail[1] ? seg(tail[1]) : null, bookId, chapter: null }
  }
  return empty
}

export function readerPath(loc: Partial<ReaderLocation> & { page: ReaderPage }): string {
  const enc = encodeURIComponent
  switch (loc.page) {
    case 'nook': return loc.console ? `${READER_ROOT}/nook/${enc(loc.console)}` : READER_ROOT
    case 'library': return loc.console ? `${READER_ROOT}/library/${enc(loc.console)}` : `${READER_ROOT}/library`
    case 'book':
      return loc.bookId ? `${READER_ROOT}/book/${enc(loc.bookId)}${loc.console ? `/${enc(loc.console)}` : ''}` : `${READER_ROOT}/library`
    case 'pages':
      return loc.bookId ? `${READER_ROOT}/book/${enc(loc.bookId)}/pages${loc.chapter ? `/${loc.chapter}` : ''}` : `${READER_ROOT}/library`
  }
}

// The pages in the order they stack: each opens from the one before it.
export const READER_PAGES: ReaderPage[] = ['nook', 'library', 'book', 'pages']
