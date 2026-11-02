import type { Phase, PhaseLevel, Planner } from './facets'

// The rows of the plan: the project, then each book with its chapters under it. A phase is on one row (its `level` and the book or chapter it is `nodeId`),
// and the row is the home of everything placed in the phase's milestones: work only moves within its row. Pure.

export const PROJECT_ROW = 'project'

// What the rows need of an outline node (an outline's nodes, or the lighter facts read for the goals; without an order they stay in the order they came).
export interface RowNode { id: string; kind: string; parentId: string | null; title: string; order?: number }

export interface PlanRow { key: string; level: PhaseLevel; nodeId: string | null; title: string; parentKey: string | null }

// A project's own phases are on its row; a book's or chapter's on the row of that book or chapter. (A template's book and chapter phases are for each book or chapter, which no
// node names: their rows are `book:` and `chapter:`.)
export const rowKey = (level: PhaseLevel, nodeId: string | null): string => (level === 'project' ? PROJECT_ROW : `${level}:${nodeId ?? ''}`)
export const rowOfPhase = (p: Pick<Phase, 'level' | 'nodeId'>): string => rowKey(p.level, p.nodeId)

// The project's row, then each book in outline order with the chapters under it (a chapter that is in no book hangs from the project).
export function planRows(outline: RowNode[], projectTitle: string): PlanRow[] {
  const children = new Map<string | null, RowNode[]>()
  for (const n of outline) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n])
  for (const list of children.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const rows: PlanRow[] = [{ key: PROJECT_ROW, level: 'project', nodeId: null, title: projectTitle || 'Project', parentKey: null }]
  const walk = (parentId: string | null, bookKey: string) => {
    for (const child of children.get(parentId) ?? []) {
      if (child.kind === 'book') {
        const key = rowKey('book', child.id)
        rows.push({ key, level: 'book', nodeId: child.id, title: child.title || 'Untitled book', parentKey: PROJECT_ROW })
        walk(child.id, key)
      } else if (child.kind === 'chapter') {
        rows.push({ key: rowKey('chapter', child.id), level: 'chapter', nodeId: child.id, title: child.title || 'Untitled chapter', parentKey: bookKey })
      } else {
        walk(child.id, bookKey)
      }
    }
  }
  walk(null, PROJECT_ROW)
  return rows
}

// A row's phases in their sequence (by `order`, then by where they start).
export function phasesOnRow(planner: Planner, key: string): Phase[] {
  return planner.phases.filter(p => rowOfPhase(p) === key).sort((a, b) => a.order - b.order || (a.start ?? '').localeCompare(b.start ?? ''))
}

// Phases on a row that is not (or no longer) in the outline: shown apart, so none of them goes missing when a book or chapter is deleted.
export function phasesOffRows(planner: Planner, rows: PlanRow[]): Phase[] {
  const keys = new Set(rows.map(r => r.key))
  return planner.phases.filter(p => !keys.has(rowOfPhase(p)))
}

// The rows under a row, of one level (the books under the project; the chapters under a book, or under the project: all of them).
export function rowsBelow(rows: PlanRow[], key: string, level: PhaseLevel): PlanRow[] {
  const below = new Set<string>()
  for (const r of rows) if (r.parentKey === key || (r.parentKey && below.has(r.parentKey))) below.add(r.key)
  return rows.filter(r => r.level === level && below.has(r.key))
}

// The row a milestone is on: that of its phase (none for a milestone on no phase).
export function rowOfMilestone(planner: Planner, milestoneId: string): string | null {
  const m = planner.milestones.find(x => x.id === milestoneId)
  const phase = m?.phaseId ? planner.phases.find(p => p.id === m.phaseId) : undefined
  return phase ? rowOfPhase(phase) : null
}
