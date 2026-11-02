import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../api/types'
import { emptyPlanner, newMilestone, newPhase } from './facets'
import { PROJECT_ROW, phasesOffRows, phasesOnRow, planRows, rowKey, rowOfMilestone, rowOfPhase, rowsBelow } from './planRows'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, order: number, title = id): OutlineNode =>
  ({ id, kind, parentId, order, title, synopsis: '', draftRef: null } as OutlineNode)

// A series holding book one (a chapter under an arc and another directly in it) and, after it, a loose book two with one chapter.
const outline = [
  node('s', 'series', null, 0), node('b1', 'book', 's', 0, 'Book One'), node('a1', 'arc', 'b1', 0), node('c2', 'chapter', 'a1', 0), node('c1', 'chapter', 'b1', 1),
  node('b2', 'book', null, 1, ''), node('c3', 'chapter', 'b2', 0, ''),
]

describe('planRows', () => {
  it('is the project, then each book in outline order with its chapters under it', () => {
    const rows = planRows(outline, 'Saga')
    expect(rows.map(r => r.key)).toEqual([PROJECT_ROW, 'book:b1', 'chapter:c2', 'chapter:c1', 'book:b2', 'chapter:c3'])
    expect(rows.map(r => r.title)).toEqual(['Saga', 'Book One', 'c2', 'c1', 'Untitled book', 'Untitled chapter'])
    expect(rows.map(r => r.parentKey)).toEqual([null, PROJECT_ROW, 'book:b1', 'book:b1', PROJECT_ROW, 'book:b2'])
  })

  it('has only the project row for an empty outline', () => {
    expect(planRows([], '').map(r => [r.key, r.title])).toEqual([[PROJECT_ROW, 'Project']])
  })

  it('finds the rows under a row, of one level', () => {
    const rows = planRows(outline, 'Saga')
    expect(rowsBelow(rows, PROJECT_ROW, 'book').map(r => r.key)).toEqual(['book:b1', 'book:b2'])
    expect(rowsBelow(rows, PROJECT_ROW, 'chapter').map(r => r.key)).toEqual(['chapter:c2', 'chapter:c1', 'chapter:c3'])
    expect(rowsBelow(rows, 'book:b1', 'chapter').map(r => r.key)).toEqual(['chapter:c2', 'chapter:c1'])
  })
})

describe('rows of phases', () => {
  const p = {
    ...emptyPlanner(),
    phases: [newPhase('late', 'Late', { order: 1 }), newPhase('early', 'Early', { order: 0 }), newPhase('b', 'Book', { level: 'book', nodeId: 'b1' }), newPhase('gone', 'Gone', { level: 'chapter', nodeId: 'deleted' })],
    milestones: [newMilestone('m', 'M', { phaseId: 'b' }), newMilestone('loose', 'L')],
  }

  it('names the row of a phase and of a milestone', () => {
    expect(rowKey('book', 'b1')).toBe('book:b1')
    expect(rowKey('project', 'ignored')).toBe(PROJECT_ROW)
    expect(rowOfPhase(p.phases[2])).toBe('book:b1')
    expect(rowOfMilestone(p, 'm')).toBe('book:b1')
    expect(rowOfMilestone(p, 'loose')).toBeNull()
  })

  it("lists a row's phases in their sequence, and the ones on rows that are gone apart", () => {
    expect(phasesOnRow(p, PROJECT_ROW).map(x => x.id)).toEqual(['early', 'late'])
    expect(phasesOffRows(p, planRows(outline, 'Saga')).map(x => x.id)).toEqual(['gone'])
  })
})
