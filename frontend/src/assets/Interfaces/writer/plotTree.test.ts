import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../../api/types'
import type { PlotNode } from '../../../api/types'
import {
  chapterOfTarget, compareByTitle, levelOfTarget, nodeLabel, orderAssignedPlotpoints, orderPlacements, outlinePositions, plotpointDescriptionAllowed,
  plotlinesUnder, selectionState, sortByTitle, titleAfterEdit,
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

describe('levelOfTarget', () => {
  it('classifies a placement target: a chapter, something inside one, or nothing that takes a plotpoint', () => {
    expect(levelOfTarget(null, outline)).toBe('none')
    expect(levelOfTarget('missing', outline)).toBe('none')
    expect(levelOfTarget('b1', outline)).toBe('none') // a book takes no plotpoint
    expect(levelOfTarget('c1', outline)).toBe('chapter')
    for (const id of ['a1', 's1', 'm1']) expect(levelOfTarget(id, outline)).toBe('inner')
  })

  it('finds the chapter a target belongs to', () => {
    for (const id of ['c1', 'a1', 's1', 'm1']) expect(chapterOfTarget(id, outline)?.id).toBe('c1')
    expect(chapterOfTarget('b1', outline)).toBeUndefined()
    expect(chapterOfTarget(null, outline)).toBeUndefined()
  })
})

describe('orderAssignedPlotpoints', () => {
  const on = (id: string, kind: OutlineNode['kind'], parentId: string | null, order: number, extra: Partial<OutlineNode> = {}): OutlineNode =>
    ({ ...node(id, kind, parentId), order, ...extra })
  // A plotpoint placed on each of `targets` (none: placed nowhere).
  const point = (id: string, targets: string | string[] | null, order = 0): PlotNode => ({
    id, kind: 'plotpoint', parentId: 'pl', order, title: id, body: '',
    placements: [targets ?? []].flat().map(targetId => ({ id: `${id}@${targetId}`, targetId, paragraphIndex: null, awareness: null })),
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

  it('puts a plotpoint at its earliest placement, and one placed nowhere last, in its own order', () => {
    // 'twice' is on s1 (June) and s2 (February): February is earlier, ahead of 'solo' on s1.
    expect(ids([point('solo', 's1'), point('twice', ['s1', 's2']), point('nowhere', null, 2), point('nowhere2', [], 1)])).toEqual(['twice', 'solo', 'nowhere2', 'nowhere'])
  })

  it('orders each placement on its own: one entry for every place, in order of occurrence', () => {
    const twice = point('twice', ['s1', 's2'])
    const solo = point('solo', 's3')
    const placements = [solo, twice].flatMap(p => (p.placements ?? []).map(placement => ({ point: p, placement })))
    expect(orderPlacements(placements, nodes, systems).map(e => e.placement.id)).toEqual(['twice@s2', 'twice@s1', 'solo@s3'])
    expect(orderPlacements(placements, nodes, systems, 'story').map(e => e.placement.id)).toEqual(['twice@s1', 'twice@s2', 'solo@s3'])
  })

  it('numbers the outline in document order', () => {
    const positions = outlinePositions(nodes)
    expect([...positions.keys()]).toEqual(['b1', 'c1', 's1', 's2', 'm2', 'c2', 's3', 'b2', 'c3', 's4'])
    expect(positions.get('s2')).toBeLessThan(positions.get('c2') ?? 0)
  })

  it("in story order leaves the Time out: by book, then where they sit in the outline", () => {
    const story = (points: PlotNode[]) => orderAssignedPlotpoints(points, nodes, systems, 'story').map(p => p.id)
    // s1 comes before s2 in the outline though it is later in time.
    expect(story([point('late', 's1'), point('early', 's2')])).toEqual(['late', 'early'])
    expect(ids([point('late', 's1'), point('early', 's2')])).toEqual(['early', 'late'])
    expect(story([point('two', 's4'), point('one', 's1')])).toEqual(['one', 'two'])
  })
})

describe('ticking plotlines', () => {
  const n = (id: string, kind: PlotNode['kind'], parentId: string | null): PlotNode =>
    ({ id, kind, parentId, order: 0, title: id, body: '', sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null }) as PlotNode
  const nodes = [n('cat', 'category', null), n('sub', 'subcategory', 'cat'), n('clu', 'cluster', 'sub'), n('a', 'plotline', 'clu'), n('b', 'plotline', 'sub'), n('c', 'plotline', 'cat'), n('pp', 'plotpoint', 'a')]
  const children = new Map<string | null, PlotNode[]>()
  for (const x of nodes) children.set(x.parentId, [...(children.get(x.parentId) ?? []), x])
  const by = (id: string) => nodes.find(x => x.id === id)!

  it('finds every plotline under a group, at any depth, and a plotline is its own', () => {
    expect(plotlinesUnder(by('cat'), children).map(x => x.id).sort()).toEqual(['a', 'b', 'c'])
    expect(plotlinesUnder(by('sub'), children).map(x => x.id).sort()).toEqual(['a', 'b'])
    expect(plotlinesUnder(by('a'), children).map(x => x.id)).toEqual(['a'])
    expect(plotlinesUnder(by('pp'), children)).toEqual([])
  })

  it('says whether all, some or none of a group is ticked', () => {
    expect(selectionState(by('sub'), children, new Set())).toBe('none')
    expect(selectionState(by('sub'), children, new Set(['a']))).toBe('some')
    expect(selectionState(by('sub'), children, new Set(['a', 'b']))).toBe('all')
    expect(selectionState(by('cat'), children, new Set(['a', 'b']))).toBe('some')
  })
})
