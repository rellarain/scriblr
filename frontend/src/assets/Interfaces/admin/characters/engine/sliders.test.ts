import { describe, expect, it } from 'vitest'
import type { ModelBind, ModelContent, ModelShape, ModelSlide } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup } from '../modelContent'
import { drawnOf, slideOnEdge } from './connect'
import { apply } from './geometry'
import { beginSlide, isPosed, movePose, resetPose } from './posing'
import { solve } from './rig'
import { edgeOf, makeSlider, repairSlide, setStop, stopSlider } from './sliders'

// Sliders (shape types T5): an edge link held between two stops along the other shape's outline (places e + t, so a stop may lie on another segment); dragged while editing
// its drawn place moves, dragged in Pose mode its posed place moves, and Reset pose takes that away.

const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
// a rail (0..100 square) and a bead whose first point is locked onto the rail's top edge, halfway
function model(slide: ModelSlide | null = null, t = 0.5): ModelContent {
  let c = addGroup(blank('Sliders'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', box('rail', 0, 0, 100, 100))
  const lock: ModelBind = { kind: 'edge', s: 'rail', i: 0, d: [0, 0], e: 0, t, o: 0, slide }
  return addShape(c, 'o', { ...box('bead', 40, -10, 20, 10), pts: box('bead', 40, -10, 20, 10).pts.map((p, i) => (i === 0 ? { ...p, bind: lock } : p)) })
}
const beadPoint = (c: ModelContent) => { const s = solve(c).shapes.bead; const [x, y] = apply(s.matrix, s.local[0].x, s.local[0].y); return { x, y } }
const near = (a: { x: number; y: number }, x: number, y: number) => { expect(a.x).toBeCloseTo(x, 1); expect(a.y).toBeCloseTo(y, 1) }
const bindOf = (c: ModelContent) => c.shapes.find(s => s.id === 'bead')!.pts[0].bind!

describe('a slider', () => {
  it('is made from a point locked onto a segment, its stops at the ends of that segment', () => {
    const s = model().shapes.find(x => x.id === 'bead')!
    const r = makeSlider(s, 0)
    expect(r.ok && r.shape.pts[0].bind!.slide).toEqual({ lo: 0, hi: 1, at: null })
    expect(makeSlider(s, 1)).toMatchObject({ ok: false })
    expect(r.ok && stopSlider(r.shape, 0).pts[0].bind!.slide).toBeNull()
  })

  it('is drawn at its posed place, held between its stops', () => {
    near(beadPoint(model({ lo: 0.2, hi: 0.8, at: null })), 50, 0)
    near(beadPoint(model({ lo: 0.2, hi: 0.8, at: 0.7 })), 70, 0)
    // a drawn place outside the stops is drawn at the nearest stop
    near(beadPoint(model({ lo: 0.6, hi: 0.8, at: null })), 60, 0)
  })

  it('runs on from one segment to the next when its stops are on both', () => {
    near(beadPoint(model({ lo: 0.5, hi: 1.5, at: 1.25 })), 100, 25)
    expect(edgeOf(1.25, 4)).toEqual([1, 0.25])
    expect(edgeOf(9, 4)).toEqual([3, 1])
  })

  it('slides between its stops while it is edited', () => {
    const c = model({ lo: 0.5, hi: 1.5, at: null })
    const s = slideOnEdge(c, solve(c), 'bead', 0, 104, 30)!
    expect(s.pts[0].bind).toMatchObject({ e: 1, t: 0.3 })
    // past the far stop it stays at the stop
    const far = slideOnEdge(c, solve(c), 'bead', 0, 100, 90)!
    expect(far.pts[0].bind).toMatchObject({ e: 1, t: 0.5 })
  })

  it('keeps its stops in order, and its places between them', () => {
    const s = model({ lo: 0.2, hi: 0.8, at: 0.7 }).shapes.find(x => x.id === 'bead')!
    const moved = setStop(s, 0, 'lo', 0.75, 4).pts[0].bind!
    expect(moved.slide).toEqual({ lo: 0.75, hi: 0.8, at: 0.75 })
    expect(moved.e + moved.t).toBeCloseTo(0.75, 3)
    expect(setStop(s, 0, 'hi', 0.1, 4).pts[0].bind!.slide).toMatchObject({ lo: 0.2, hi: 0.2 })
  })

  it('slides in Pose mode, and Reset pose puts it back', () => {
    const c = model({ lo: 0.5, hi: 1.5, at: null })
    const r = beginSlide(c, 'bead', 0, drawnOf(c, solve(c), 'rail'))
    if (!r.ok) throw new Error(r.reason)
    const posed = movePose(c, r.drag, [100, 30])
    expect(bindOf(posed).slide!.at).toBeCloseTo(1.3, 2)
    expect(bindOf(posed)).toMatchObject({ e: 0, t: 0.5 })
    expect(isPosed(posed)).toBe(true)
    expect(bindOf(resetPose(posed)).slide!.at).toBeNull()
  })

  it('is repaired as the server repairs it', () => {
    expect(repairSlide({ lo: 2, hi: 1, at: 7 }, 'edge')).toEqual({ lo: 1, hi: 2, at: 2 })
    expect(repairSlide({ lo: 0, hi: 1 }, 'point')).toBeNull()
    expect(repairSlide('no', 'edge')).toBeNull()
  })
})
