import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup } from '../modelContent'
import { parseModelFile, serializeModels } from '../modelFile'
import { addPoint, joinSegment } from './edit'
import { edgeCount, edgeFlags, edgeHome, homeEdgeLined, linePathText, reverseFlags, setAllEdgeLines, setEdgeLine, setHomeEdge } from './edges'
import { build, roundCorners } from './geometry'
import { makeTwin } from './pairEdit'
import { solve } from './rig'

// Per-edge outlines (slice 9a): edge e runs from point e to the next, and `line: false` on point e leaves its outline out.

const pts = (list: Array<[number, number]>, off: number[] = []): ModelPoint[] => list.map(([x, y], i) => ({ x, y, m: 's' as const, ...(off.includes(i) ? { line: false as const } : {}) }))
const SQUARE: Array<[number, number]> = [[60, 100], [100, 100], [100, 140], [60, 140]]
const square = (id: string, off: number[] = []): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, outline: 0.75, pts: pts(SQUARE, off) })
function model(shape: ModelShape): ModelContent {
  let c = addGroup(blank('Edges'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  return addShape(c, 'o', shape)
}

describe('the path of the outlined edges', () => {
  it('is the whole closed outline when every edge has one', () => {
    expect(linePathText(build(pts(SQUARE), true), true, [true, true, true, true])).toBe('M60 100L100 100L100 140L60 140L60 100Z')
  })
  it('starts after an edge with no outline, so a run wraps round past the first point', () => {
    expect(linePathText(build(pts(SQUARE), true), true, [true, false, true, true])).toBe('M100 140L60 140L60 100L100 100')
  })
  it('gives each run its own subpath, and nothing when no edge has one', () => {
    expect(linePathText(build(pts(SQUARE), true), true, [true, false, true, false])).toBe('M100 140L60 140M60 100L100 100')
    expect(linePathText(build(pts(SQUARE), true), true, [false, false, false, false])).toBe('')
  })
  it('reads an open line’s edges only (its last point has no edge after it)', () => {
    expect(linePathText(build(pts(SQUARE), false), false, [false, true, true, false])).toBe('M100 100L100 140L60 140')
  })
})

describe('the flags', () => {
  it('are null when every edge has the outline', () => {
    expect(edgeFlags(pts(SQUARE))).toBeNull()
    expect(edgeFlags(pts(SQUARE, [1]))).toEqual([true, false, true, true])
  })
  it('run the other way round in a mirror image', () => {
    // the twin's point j is the original's point 3 - j, so the original's top edge (edge 0) is the twin's edge 2
    expect(reverseFlags([false, true, true, true])).toEqual([true, true, false, true])
    expect(reverseFlags(null)).toBeNull()
  })
  it('are set one edge at a time or all at once, and a lined edge keeps no flag', () => {
    const one = setEdgeLine(pts(SQUARE), 2, false)
    expect(one.map(p => p.line)).toEqual([undefined, undefined, false, undefined])
    expect('line' in setEdgeLine(one, 2, true)[2]).toBe(false)
    expect(edgeCount(setAllEdgeLines(one, false), true)).toEqual({ lined: 0, edges: 4 })
    expect(edgeCount(setAllEdgeLines(one, true), true)).toEqual({ lined: 4, edges: 4 })
    expect(edgeCount(one, false)).toEqual({ lined: 2, edges: 3 })
  })
})

describe('the solver', () => {
  it('draws the outline along the outlined edges only, and leaves lineD out when every edge has one', () => {
    const c = model(square('a', [1]))
    expect(solve(c, {}, 'front', {}).shapes.a.lineD).toBe('M100 140L60 140L60 100L100 100')
    expect(solve(model(square('a')), {}, 'front', {}).shapes.a.lineD).toBeUndefined()
  })
  it('outlines a twin as its original is, mirrored', () => {
    const made = makeTwin(model(square('a', [0])), 'shape', 'a', () => 'b')
    expect(made.ok).toBe(true)
    const c = made.ok ? made.content : model(square('a'))
    const twin = c.shapes.find(s => s.mirrorOf === 'a')!
    // the original's top edge has no outline, so neither has the twin's (from (100, 100) to (140, 100))
    expect(solve(c, {}, 'front', {}).shapes[twin.id].lineD).toBe('M140 100L140 140L100 140L100 100')
    // the editor keeps the twin's edges on the original, the other way round
    const home = edgeHome(c.shapes, twin, false)!
    expect(home.shapeId).toBe('a')
    expect(homeEdgeLined(home, 2)).toBe(false)
    expect(setHomeEdge(home, 2, true).some(p => p.line === false)).toBe(false)
  })
})

describe('edits keep each edge’s outline', () => {
  it('a rounded corner goes with the edge that comes into it', () => {
    const r = roundCorners(pts(SQUARE, [1]), true, 5)
    expect(r).toHaveLength(8)
    // corner 1 (into edge 1): its curve keeps edge 0's outline, the rest of edge 1 has none; corner 2's curve goes with edge 1
    expect(r.map(p => p.line !== false)).toEqual([true, true, true, false, false, true, true, true])
  })
  it('a point added on an edge splits it, both halves keeping its outline', () => {
    const { shape, index } = addPoint(square('a', [1]), 1)
    expect(index).toBe(2)
    expect(shape.pts.map(p => p.line !== false)).toEqual([true, false, false, true, true])
  })
  it('a joined segment goes out along the next point’s edge', () => {
    const joined = joinSegment(square('a', [2]), 1)!
    expect(joined.pts.map(p => p.line !== false)).toEqual([true, false, true])
  })
  it('a model file keeps the flags (only edges with no outline are written)', () => {
    const c = model(square('a', [3]))
    const read = parseModelFile(serializeModels([c])).models[0]
    expect(read.shapes[0].pts.map(p => p.line)).toEqual([undefined, undefined, undefined, false])
  })
})
