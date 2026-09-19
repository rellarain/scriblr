import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../../api/types'
import type { PlotNode } from '../../../api/types'
import {
  assignedLevel, chapterOfAssignment, compareByTitle, nodeLabel, orderAssignedPlotpoints, plotpointDescriptionAllowed,
  sortByTitle, titleAfterEdit,
} from './plotTree'
import { standardSystem } from './timeSystem'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null): OutlineNode => ({
  id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, flag: null, color: null,
  chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
})
const outline = new Map(
  [node('b1', 'book', null), node('c1', 'chapter', 'b1'), node('a1', 'act', 'c1'), node('s1', 'scene', 'a1'), node('m1', 'moment', 's1')]
    .map(n => [n.id, n]),
)

describe('sortByTitle', () => {
  const item = (title: string, order: number) => ({ title, order })

  it('sorts case-insensitively and naturally', () => {
    const sorted = sortByTitle([item('banana', 0), item('Apple', 1), item('cherry', 2), item('apple pie', 3)])
    expect(sorted.map(i => i.title)).toEqual(['Apple', 'apple pie', 'banana', 'cherry'])
    expect(sortByTitle([item('Act 10', 0), item('Act 2', 1), item('Act 1', 2)]).map(i => i.title)).toEqual(['Act 1', 'Act 2', 'Act 10'])
  })

  it('puts blank titles last, in their stored order', () => {
    const sorted = sortByTitle([item('', 5), item('Zed', 1), item('  ', 2), item('Alpha', 3)])
    expect(sorted.map(i => `${i.title.trim()}#${i.order}`)).toEqual(['Alpha#3', 'Zed#1', '#2', '#5'])
  })

  it('does not mutate its input, and breaks title ties by order', () => {
    const input = [item('Same', 2), item('Same', 1)]
    expect(sortByTitle(input).map(i => i.order)).toEqual([1, 2])
    expect(input.map(i => i.order)).toEqual([2, 1])
    expect(compareByTitle(item('a', 0), item('a', 0))).toBe(0)
  })
})

describe('nodeLabel', () => {
  it('falls back to Untitled <kind> for blank titles', () => {
    expect(nodeLabel({ title: '', kind: 'chapter' })).toBe('Untitled chapter')
    expect(nodeLabel({ title: '   ', kind: 'category' })).toBe('Untitled category')
    expect(nodeLabel({ title: 'Prologue', kind: 'chapter' })).toBe('Prologue')
  })
})

describe('plotpoint title rules', () => {
  it('only allows a description once there is a title', () => {
    expect(plotpointDescriptionAllowed({ title: '' })).toBe(false)
    expect(plotpointDescriptionAllowed({ title: '  ' })).toBe(false)
    expect(plotpointDescriptionAllowed({ title: 'Reveal' })).toBe(true)
  })

  it('becomes Untitled only when the title is empty and a description has text', () => {
    expect(titleAfterEdit('', 'some detail')).toBe('Untitled')
    expect(titleAfterEdit('   ', 'some detail')).toBe('Untitled')
    expect(titleAfterEdit('', '')).toBe('')
    expect(titleAfterEdit('', '  ')).toBe('')
    expect(titleAfterEdit('Reveal', 'detail')).toBe('Reveal')
  })
})

describe('assignedLevel', () => {
  it('classifies the assignment target', () => {
    expect(assignedLevel({ assignedMomentId: null }, outline)).toBe('none')
    expect(assignedLevel({ assignedMomentId: 'missing' }, outline)).toBe('none')
    expect(assignedLevel({ assignedMomentId: 'b1' }, outline)).toBe('book')
    expect(assignedLevel({ assignedMomentId: 'c1' }, outline)).toBe('chapter')
    for (const id of ['a1', 's1', 'm1']) expect(assignedLevel({ assignedMomentId: id }, outline)).toBe('inner')
  })

  it('finds the chapter an assignment belongs to', () => {
    for (const id of ['c1', 'a1', 's1', 'm1']) expect(chapterOfAssignment({ assignedMomentId: id }, outline)?.id).toBe('c1')
    expect(chapterOfAssignment({ assignedMomentId: 'b1' }, outline)).toBeUndefined()
    expect(chapterOfAssignment({ assignedMomentId: null }, outline)).toBeUndefined()
  })
})

describe('orderAssignedPlotpoints', () => {
  const on = (id: string, kind: OutlineNode['kind'], parentId: string | null, order: number, extra: Partial<OutlineNode> = {}): OutlineNode =>
    ({ ...node(id, kind, parentId), order, ...extra })
  const point = (id: string, assignedMomentId: string | null, order = 0): PlotNode => ({
    id, kind: 'plotpoint', parentId: 'pl', order, title: id, body: '', assignedMomentId, assignedParagraphIndex: null,
    sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null,
  })

  // Two books; book 1 chapters c1 (scenes s1 late, s2 early) and c2 (scene s3), book 2 chapter c3.
  const nodes: OutlineNode[] = [
    on('b1', 'book', null, 0), on('b2', 'book', null, 1),
    on('c1', 'chapter', 'b1', 0), on('c2', 'chapter', 'b1', 1), on('c3', 'chapter', 'b2', 0),
    on('s1', 'scene', 'c1', 0, { timeValue: { year: 1024, month: 5, day: 1 } }),
    on('s2', 'scene', 'c1', 1, { timeValue: { year: 1024, month: 1, day: 1 } }),
    on('m2', 'moment', 's2', 0),
    on('s3', 'scene', 'c2', 0),
    on('s4', 'scene', 'c3', 0, { timeValue: { year: 1 } }),
  ]
  const systems = [standardSystem()]
  const ids = (points: PlotNode[]) => orderAssignedPlotpoints(points, nodes, systems).map(p => p.id)

  it('orders by the Time of the assigned scene, not by outline position', () => {
    expect(ids([point('late', 's1'), point('early', 's2')])).toEqual(['early', 'late'])
  })

  it("uses a moment's scene, and the first timed scene inside a chapter", () => {
    // c1's first timed scene in outline order is s1 (June 1024), later than m2's scene s2 (February 1024).
    expect(ids([point('chapter', 'c1'), point('moment', 'm2')])).toEqual(['moment', 'chapter'])
  })

  it('puts untimed plotpoints after timed ones in the same book, in outline order', () => {
    // The book itself comes before its chapters and scenes in the outline, so a book-level plotpoint precedes the untimed scene.
    expect(ids([point('untimed', 's3'), point('timed', 's1'), point('bookLevel', 'b1')])).toEqual(['timed', 'bookLevel', 'untimed'])
  })

  it('groups by book first, and breaks ties by the stored order', () => {
    expect(ids([point('two', 's4'), point('one', 's1')])).toEqual(['one', 'two'])
    expect(ids([point('b', 's1', 2), point('a', 's1', 1)])).toEqual(['a', 'b'])
  })
})
