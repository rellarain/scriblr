import type { OutlineNode } from '../../../../api/types'
import { booksOf, chaptersOfBook } from '../outlineTree'
import { nodeLabel } from '../plotTree'

// What the read-only tile bodies show, worked out from the outline and plot lists.

export interface ProjectRow { id: string; title: string; books: number; chapters: number; moments: number }

export function projectRows(projects: { projectId: string; title: string }[], outlines: Record<string, OutlineNode[]>): ProjectRow[] {
  return projects.map(p => {
    const nodes = outlines[p.projectId] ?? []
    const books = booksOf(nodes)
    const chapters = books.reduce((n, b) => n + chaptersOfBook(nodes, b.id).length, 0)
    return { id: p.projectId, title: p.title, books: books.length, chapters, moments: nodes.filter(n => n.kind === 'moment' && !n.freeDraft).length }
  })
}

export function projectTotals(rows: ProjectRow[]): { projects: number; books: number; chapters: number; moments: number } {
  return rows.reduce(
    (t, r) => ({ ...t, books: t.books + r.books, chapters: t.chapters + r.chapters, moments: t.moments + r.moments }),
    { projects: rows.length, books: 0, chapters: 0, moments: 0 },
  )
}

export interface BookRow { id: string; title: string; chapters: number }

export function bookRows(nodes: OutlineNode[]): BookRow[] {
  return booksOf(nodes).map(b => ({ id: b.id, title: nodeLabel(b), chapters: chaptersOfBook(nodes, b.id).length }))
}
