import { describe, expect, it } from 'vitest'
import type { OutlineNode, PlotNode, PlotPlacement } from '../../../api/types'
import {
  MAX_PLACEMENTS, allPlacements, cycleAwareness, isPlaced, livePlacements, movePlacement, placedCount, placeValue, placementNumber, pointsByTarget,
  repairPlacements, retargetPlacements, unplace,
} from './plotPlacement'
import { outlinePositions } from './plotTree'

const out = (id: string, kind: OutlineNode['kind'], parentId: string | null, order = 0): OutlineNode =>
  ({ id, kind, parentId, order, title: id, synopsis: '', draftRef: null } as OutlineNode)
const outline = [
  out('book', 'book', null), out('ch1', 'chapter', 'book'), out('ch2', 'chapter', 'book', 1),
  out('act', 'act', 'ch1'), out('scene', 'scene', 'act'), out('m1', 'moment', 'scene'), out('m2', 'moment', 'scene', 1),
]
const outlineById = new Map(outline.map(n => [n.id, n]))

const at = (targetId: string, awareness: PlotPlacement['awareness'] = null, id = `at-${targetId}`): PlotPlacement => ({ id, targetId, paragraphIndex: null, awareness })
const point = (id: string, placements: PlotPlacement[] = [], order = 0): PlotNode => ({
  id, kind: 'plotpoint', parentId: 'line', order, title: id, body: '', sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null,
  fieldId: 'f', refId: null, placements,
})
const find = (nodes: PlotNode[], id: string) => nodes.find(n => n.id === id)!
const targets = (nodes: PlotNode[], id: string) => (find(nodes, id).placements ?? []).map(p => p.targetId)
let counter = 0
const makeId = () => `new${(counter += 1)}`

describe('placing a plotpoint', () => {
  it('takes a chapter, an act, a scene or a moment, and refuses a book, an unknown target and a node that is not a plotpoint', () => {
    const nodes = [point('p'), { ...point('line'), kind: 'plotline' as const }]
    for (const target of ['ch1', 'act', 'scene', 'm1']) expect(targets(placeValue(nodes, 'p', target, outlineById, makeId), 'p')).toEqual([target])
    expect(placeValue(nodes, 'p', 'book', outlineById, makeId)).toBe(nodes)
    expect(placeValue(nodes, 'p', 'nope', outlineById, makeId)).toBe(nodes)
    expect(placeValue(nodes, 'line', 'ch1', outlineById, makeId)).toBe(nodes)
    expect(placeValue(nodes, 'missing', 'ch1', outlineById, makeId)).toBe(nodes)
  })

  it('can place one plotpoint in many places, but never twice on the same one', () => {
    let nodes = [point('p')]
    for (const target of ['ch1', 'ch2', 'act', 'm1']) nodes = placeValue(nodes, 'p', target, outlineById, makeId)
    expect(targets(nodes, 'p')).toEqual(['ch1', 'ch2', 'act', 'm1'])
    expect(placeValue(nodes, 'p', 'ch2', outlineById, makeId)).toBe(nodes)
    expect(new Set((find(nodes, 'p').placements ?? []).map(p => p.id)).size).toBe(4)
  })

  it('gives a placement on a moment the front-stage awareness, and one anywhere else none', () => {
    const nodes = placeValue(placeValue([point('p')], 'p', 'm1', outlineById, makeId), 'p', 'scene', outlineById, makeId)
    expect((find(nodes, 'p').placements ?? []).map(p => [p.targetId, p.awareness, p.paragraphIndex])).toEqual([['m1', 'front', null], ['scene', null, null]])
  })

  it('stops at the limit', () => {
    const full = [point('p', Array.from({ length: MAX_PLACEMENTS }, (_, i) => at(`x${i}`)))]
    expect(placeValue(full, 'p', 'ch1', outlineById, makeId)).toBe(full)
  })
})

describe('moving, taking away and stepping a placement', () => {
  const placed = () => [point('p', [at('ch1'), at('m1', 'back'), at('m2', 'off')]), point('other', [at('ch1')])]

  it('moves one placement and leaves the others, keeping its awareness from moment to moment and clearing it elsewhere', () => {
    const nodes = placed()
    const toScene = movePlacement(nodes, 'p', 'at-m1', 'scene', outlineById)
    expect((find(toScene, 'p').placements ?? []).map(p => [p.targetId, p.awareness])).toEqual([['ch1', null], ['scene', null], ['m2', 'off']])
    const toChapter = movePlacement(nodes, 'p', 'at-ch1', 'ch2', outlineById)
    expect(targets(toChapter, 'p')).toEqual(['ch2', 'm1', 'm2'])
    const intoMoment = movePlacement(toScene, 'p', 'at-m1', 'm1', outlineById)
    expect(find(intoMoment, 'p').placements?.[1]).toMatchObject({ targetId: 'm1', awareness: 'front' })
    const momentToMoment = movePlacement([point('q', [at('m1', 'mid')])], 'q', 'at-m1', 'm2', outlineById)
    expect(find(momentToMoment, 'q').placements?.[0]).toMatchObject({ targetId: 'm2', awareness: 'mid' })
    expect(find(toScene, 'other').placements).toEqual([at('ch1')])
  })

  it('merges a move onto a target the plotpoint is already on into the placement that is there, and refuses a target that takes nothing', () => {
    const nodes = placed()
    const merged = movePlacement(nodes, 'p', 'at-ch1', 'm2', outlineById)
    expect((find(merged, 'p').placements ?? []).map(p => [p.targetId, p.awareness])).toEqual([['m1', 'back'], ['m2', 'off']])
    expect(movePlacement(nodes, 'p', 'at-ch1', 'book', outlineById)).toBe(nodes)
    expect(movePlacement(nodes, 'p', 'at-ch1', 'ch1', outlineById)).toBe(nodes)
    expect(movePlacement(nodes, 'p', 'no-such', 'ch2', outlineById)).toBe(nodes)
  })

  it('takes one placement away and leaves the plotpoint with the rest', () => {
    const nodes = placed()
    expect(targets(unplace(nodes, 'p', 'at-m1'), 'p')).toEqual(['ch1', 'm2'])
    expect(targets(unplace(unplace(unplace(nodes, 'p', 'at-m1'), 'p', 'at-ch1'), 'p', 'at-m2'), 'p')).toEqual([])
    expect(unplace(nodes, 'p', 'no-such')).toBe(nodes)
    expect(targets(unplace(nodes, 'p', 'at-ch1'), 'other')).toEqual(['ch1'])
  })

  it('steps one placement through the four awareness states and round again, only on a moment', () => {
    let nodes = placed()
    const seen = []
    for (let i = 0; i < 5; i += 1) { nodes = cycleAwareness(nodes, 'p', 'at-m1'); seen.push(find(nodes, 'p').placements?.[1].awareness) }
    expect(seen).toEqual(['mid', 'off', 'front', 'back', 'mid'])
    expect(find(nodes, 'p').placements?.[2].awareness).toBe('off') // the other placement is not touched
    expect(cycleAwareness(nodes, 'p', 'at-ch1')).toBe(nodes) // a chapter has none
  })
})

describe('what is placed', () => {
  it('counts the placements whose target is really somewhere, and is placed with one', () => {
    const p = point('p', [at('ch1'), at('m1'), at('gone'), at('book')])
    expect(livePlacements(p, outlineById).map(x => x.targetId)).toEqual(['ch1', 'm1'])
    expect(placedCount(p, outlineById)).toBe(2)
    expect(isPlaced(p, outlineById)).toBe(true)
    expect(isPlaced(point('q', [at('gone')]), outlineById)).toBe(false)
    expect(isPlaced(point('r'), outlineById)).toBe(false)
  })

  it('lists the placements on each outline node, in the plotpoints\' own order', () => {
    const nodes = [point('b', [at('ch1', null, 'b1'), at('m1', 'back', 'b2')], 1), point('a', [at('ch1', null, 'a1')], 0), { ...point('line'), kind: 'plotline' as const }]
    const byNode = pointsByTarget(nodes)
    expect(byNode.get('ch1')?.map(e => [e.point.id, e.placement.id])).toEqual([['a', 'a1'], ['b', 'b1']])
    expect(byNode.get('m1')?.map(e => e.placement.id)).toEqual(['b2'])
    expect(byNode.has('act')).toBe(false)
    expect(allPlacements(nodes)).toHaveLength(3)
  })

  it('numbers a plotpoint\'s placements in story order ("2 of 3")', () => {
    const p = point('p', [at('m1'), at('ch2'), at('ch1')])
    const positions = outlinePositions(outline)
    expect(['at-ch1', 'at-m1', 'at-ch2'].map(id => placementNumber(p, id, positions))).toEqual([{ n: 1, of: 3 }, { n: 2, of: 3 }, { n: 3, of: 3 }])
  })
})

describe('outline nodes going', () => {
  it('moves a placement on a deleted node to the chapter around it, once, and takes the others away', () => {
    const nodes = [
      point('on', [at('m1', 'back'), at('ch2')]),
      point('both', [at('m1'), at('ch1')]),
      point('away', [at('m1'), at('m2')]),
      point('else', [at('ch2')]),
    ]
    const removed = new Set(['m1'])
    const next = retargetPlacements(nodes, removed, 'ch1', outlineById)
    expect((find(next, 'on').placements ?? []).map(p => [p.targetId, p.awareness])).toEqual([['ch1', null], ['ch2', null]])
    expect(targets(next, 'both')).toEqual(['ch1']) // already there: not twice
    expect(targets(next, 'away')).toEqual(['ch1', 'm2'])
    expect(find(next, 'else')).toBe(nodes[3])
    // Nothing around it (a chapter itself going): the placements go.
    expect(targets(retargetPlacements(nodes, new Set(['ch2']), null, outlineById), 'on')).toEqual(['m1'])
    // Nothing affected: the same array.
    expect(retargetPlacements(nodes, new Set(['elsewhere']), 'ch1', outlineById)).toBe(nodes)
  })
})

describe('repairPlacements', () => {
  it('hands back the node it was given when there is nothing to repair', () => {
    const p = point('p', [at('ch1'), at('m1', 'mid')])
    expect(repairPlacements(p, outlineById, makeId)).toBe(p)
    expect(repairPlacements(point('q'), outlineById, makeId)).toBeDefined()
  })

  it('reads an old single place in, once, and empties the old fields', () => {
    const old = { ...point('p'), assignedMomentId: 'm1', assignedParagraphIndex: 2, awareness: 'off' as const }
    const fixed = repairPlacements(old, outlineById, makeId)
    expect(fixed.placements).toEqual([{ id: expect.any(String), targetId: 'm1', paragraphIndex: 2, awareness: 'off' }])
    expect([fixed.assignedMomentId, fixed.assignedParagraphIndex, fixed.awareness]).toEqual([null, null, null])
    expect(repairPlacements(fixed, outlineById, makeId)).toBe(fixed)
  })
})
