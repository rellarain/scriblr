import type { OutlineNode, PlotNode } from '../../../../api/types'
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

export interface PlotCounts { categories: number; plotlines: number; values: number; placed: number; waiting: number }

// Values are the plotpoints: one that sits on a chapter (or deeper) is placed, the rest are waiting.
export function plotCounts(nodes: PlotNode[]): PlotCounts {
  const values = nodes.filter(n => n.kind === 'plotpoint')
  const placed = values.filter(n => n.assignedMomentId !== null).length
  return {
    categories: nodes.filter(n => n.kind === 'category').length,
    plotlines: nodes.filter(n => n.kind === 'plotline').length,
    values: values.length,
    placed,
    waiting: values.length - placed,
  }
}

export interface CategoryRow { id: string; title: string; plotlines: number }

export function categoryRows(nodes: PlotNode[]): CategoryRow[] {
  const categories = nodes.filter(n => n.kind === 'category').sort((a, b) => a.order - b.order)
  const subs = new Map<string, string>() // subcategory id -> category id
  for (const n of nodes) if (n.kind === 'subcategory' && n.parentId) subs.set(n.id, n.parentId)
  return categories.map(c => ({
    id: c.id,
    title: nodeLabel(c),
    plotlines: nodes.filter(n => n.kind === 'plotline' && (n.parentId === c.id || subs.get(n.parentId ?? '') === c.id)).length,
  }))
}
