import type { BookProgress, OutlineNode } from '../../../api/types'
import type { CatalogBook, ReadingPosition } from '../../../api/reader'
import { shelfGroups, type ShelfGroup } from '../writer/outlineTree'

// The Writer's shelf draws the Reader's books too: a catalog book stands as a spine (its width follows its word count) with one bar, how far
// the reader has read. These adapters give the shelf the nodes and the progress it expects.

const node = (over: Partial<OutlineNode> & Pick<OutlineNode, 'id' | 'kind' | 'title' | 'order'>): OutlineNode => ({
  parentId: null,
  synopsis: '',
  draftRef: null,
  flag: null,
  color: null,
  chapterCountTarget: null,
  plotlineIds: [],
  wordCountGoal: null,
  ...over,
})

export const bookNode = (book: CatalogBook, order: number, parentId: string | null = null): OutlineNode =>
  node({ id: book.id, kind: 'book', title: book.title, order, parentId, themeHue: book.hue, wordCountGoal: book.wordCount > 0 ? book.wordCount : null })

export const labelNode = (id: string, title: string, order: number): OutlineNode => node({ id, kind: 'series', title, order })

// A named section of books (a series, "Borrowed", "Lent out") or loose ones (a null label).
export interface ShelfSection { id: string; label: string | null; books: CatalogBook[] }

export function shelfGroupsOf(sections: ShelfSection[]): ShelfGroup[] {
  const nodes: OutlineNode[] = []
  sections.forEach((section, i) => {
    if (section.label === null) {
      section.books.forEach((b, j) => nodes.push(bookNode(b, i * 1000 + j)))
      return
    }
    nodes.push(labelNode(`section-${section.id}`, section.label, i * 1000))
    section.books.forEach((b, j) => nodes.push(bookNode(b, j, `section-${section.id}`)))
  })
  return shelfGroups(nodes)
}

// A series's books in order, then the loose ones: the sections of a shelf that groups a list of books by series.
export function sectionsBySeries(books: CatalogBook[]): ShelfSection[] {
  const series = new Map<string, { title: string; books: CatalogBook[] }>()
  const loose: CatalogBook[] = []
  for (const b of books) {
    if (b.series) {
      const entry = series.get(b.series.id) ?? { title: b.series.title, books: [] }
      entry.books.push(b)
      series.set(b.series.id, entry)
    } else loose.push(b)
  }
  const out: ShelfSection[] = [...series.entries()].map(([id, s]) => ({ id, label: s.title, books: s.books.sort((a, b) => (a.series?.order ?? 0) - (b.series?.order ?? 0)) }))
  if (loose.length) out.push({ id: 'loose', label: null, books: loose })
  return out
}

const NONE = { done: 0, total: 0 }

// The one bar a reader's spine has: the words read of the book. A book not started has none.
export function progressFor(book: CatalogBook, position: ReadingPosition | undefined): BookProgress {
  const words = position && book.wordCount > 0 ? { done: Math.round((book.wordCount * position.pct) / 100), total: book.wordCount } : NONE
  return { plotting: NONE, outlining: NONE, planning: NONE, assignment: NONE, revision: NONE, published: NONE, words }
}

export function progressMap(books: CatalogBook[], positions: Record<string, ReadingPosition>): Record<string, BookProgress> {
  return Object.fromEntries(books.map(b => [b.id, progressFor(b, positions[b.id])]))
}
