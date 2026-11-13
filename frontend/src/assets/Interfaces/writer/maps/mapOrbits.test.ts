import { describe, expect, it } from 'vitest'
import type { MapDoc, MapShape } from '../../../../api/types'
import { addLibraryShape, addOrbit, bodiesOn, editOrbit, hitItem, isSpace, leaveOrbit, removeItem, settled, withShape } from './mapItems'
import { draftOf, toggleLayer, type MapDraft } from './mapModel'
import { ellipseAt } from './mapOutline'
import { ORBIT_RADIUS, catchBodies, distanceToPath, makeOrbit, middleOf, nearestAngle, placeOn, settleBody, withEllipse } from './mapOrbits'
import { starterShapes } from './mapShapeSeed'
import { shapeBounds, translateShape } from './mapShapes'
import { defaultsFor } from './mapLevels'

const doc = (over: Partial<MapDoc> = {}): MapDoc => ({
  schemaVersion: 2, id: 'map_sys', title: 'Aster', level: 'galactic', mapFormat: 3, base: { biome: 'space', height: 0 }, units: 'metric',
  parentId: null, order: 0, width: 30, height: 20, cellSize: 0.1, unit: 'AU', pace: null,
  layers: [
    { id: 'terrain', name: 'Biomes', kind: 'terrain', visible: true, locked: false },
    { id: 'shapes', name: 'Regions and lines', kind: 'shapes', visible: true, locked: false },
    { id: 'labels', name: 'Labels', kind: 'labels', visible: true, locked: false },
  ],
  labels: [], shapes: [], scaleBar: false, compass: false, legend: false, updatedAt: 'x', ...over,
})
const draft = (over: Partial<MapDoc> = {}): MapDraft => draftOf(doc(over))
const ids = (...seed: string[]) => { let n = 0; return () => seed[n++] ?? `x${n}` }
const lib = (id: string) => starterShapes().find(s => s.id === id)!
// A planet a cell across, its middle at (x, y).
const planet = (id: string, x: number, y: number, over: Partial<MapShape> = {}): MapShape => ({
  id, layerId: 'terrain', type: 'biome', style: 'solid', color: null, width: 0.05, fill: null, opacity: 1, pattern: 'solid', biome: 'planet_rocky', name: '', mapIds: [],
  points: [[x - 0.5, y - 0.5], [x + 0.5, y - 0.5], [x + 0.5, y + 0.5], [x - 0.5, y + 0.5]].map(([px, py]) => ({ x: px, y: py, smooth: false, hx: null, hy: null })), ...over,
})
// An orbit round (15, 10).
const orbit = (id = 'orb_a', rx = 6, ry = 4, turn = 0) => ({ ...makeOrbit(id, 'shapes', 15, 10, rx), ellipse: { cx: 15, cy: 10, rx, ry, turn } }) as MapShape & { ellipse: NonNullable<MapShape['ellipse']> }
const near = (a: number, b: number, d = 0.02) => Math.abs(a - b) <= d

describe('the path of an orbit', () => {
  it('goes round its centre, turned by its turn, clockwise from its own right', () => {
    const e = { cx: 10, cy: 10, rx: 4, ry: 2, turn: 0 }
    expect(ellipseAt(e, 0)).toEqual({ x: 14, y: 10 })
    expect(ellipseAt(e, 90).y).toBeCloseTo(12, 6)
    const turned = ellipseAt({ ...e, turn: 90 }, 0)
    expect(turned.x).toBeCloseTo(10, 6)
    expect(turned.y).toBeCloseTo(14, 6)
  })

  it('finds the angle of its point nearest a point, and how far that is', () => {
    const e = { cx: 10, cy: 10, rx: 5, ry: 3, turn: 20 }
    for (const a of [0, 37.5, 123, 250.25, 359]) {
      const p = ellipseAt(e, a)
      expect(near(nearestAngle(e, p.x, p.y), a, 0.05) || near(nearestAngle(e, p.x, p.y), a + 360, 0.05)).toBe(true)
      expect(distanceToPath(e, p.x, p.y)).toBeLessThan(0.01)
    }
    expect(distanceToPath({ cx: 0, cy: 0, rx: 5, ry: 5, turn: 0 }, 0, 0)).toBeCloseTo(5, 3)
  })

  it('keeps its radii in range, its centre on the map and its turn wrapped to -180..180', () => {
    const o = orbit()
    expect(withEllipse(o, { rx: 0, ry: 9999 }, 30, 20).ellipse).toMatchObject({ rx: ORBIT_RADIUS.min, ry: ORBIT_RADIUS.max })
    expect(withEllipse(o, { turn: 270 }, 30, 20).ellipse!.turn).toBe(-90)
    expect(withEllipse(o, { turn: -190 }, 30, 20).ellipse!.turn).toBe(170)
    expect(withEllipse(o, { cx: 99, cy: -3 }, 30, 20).ellipse).toMatchObject({ cx: 30, cy: 0 })
    expect(withEllipse(o, { rx: Number.NaN }, 30, 20).ellipse!.rx).toBe(6)
  })

  it('is drawn and picked as a line round its path, and moves by its centre', () => {
    const o = orbit()
    const b = shapeBounds({ ...o, width: 0 })
    expect([b.x0, b.x1, b.y0, b.y1].map(n => Math.round(n * 100) / 100)).toEqual([9, 21, 6, 14])
    const d = draft({ shapes: [o] })
    expect(hitItem(d, 21, 10)).toEqual({ kind: 'shape', id: 'orb_a' })
    expect(hitItem(d, 15, 10)).toBeNull() // not filled: the middle is empty
    expect(translateShape(o, 2, -1, 30, 20).ellipse).toMatchObject({ cx: 17, cy: 9 })
  })
})

describe('bodies on an orbit', () => {
  it('a body dropped near the path is caught: its middle on the path, and the orbit and angle kept on it', () => {
    const o = orbit()
    const caught = settleBody([o], planet('p', 21.3, 10.2), 30, 20)
    expect(caught.orbit?.id).toBe('orb_a')
    const m = middleOf(caught)
    expect(distanceToPath(o.ellipse, m.x, m.y)).toBeLessThan(0.02)
    expect(near(caught.orbit!.angle, 0, 3) || near(caught.orbit!.angle, 360, 3)).toBe(true)
  })

  it('a body far from every path, or too big for the orbit, stays where it is', () => {
    expect(settleBody([orbit()], planet('p', 15, 10), 30, 20).orbit ?? null).toBeNull()
    const big = { ...planet('p', 21, 10), points: planet('p', 21, 10).points.map(p => ({ ...p, x: 21 + (p.x - 21) * 8, y: 10 + (p.y - 10) * 8 })) }
    expect(settleBody([orbit()], big, 30, 20).orbit ?? null).toBeNull()
  })

  it('a body on an orbit keeps to it when it is moved, at the point nearest where it was dropped', () => {
    const o = orbit()
    const on = placeOn(planet('p', 0, 0), o, 0, 30, 20)
    const dropped = translateShape(on, -6, -6, 30, 20) // towards the top of the orbit and beyond it
    const kept = settleBody([o], dropped, 30, 20)
    expect(kept.orbit?.id).toBe('orb_a')
    const m = middleOf(kept)
    expect(distanceToPath(o.ellipse, m.x, m.y)).toBeLessThan(0.02)
    expect(kept.orbit!.angle).toBeGreaterThan(180)
  })

  it('a body lets go of an orbit that is gone', () => {
    const on = placeOn(planet('p', 0, 0), orbit(), 90, 30, 20)
    expect(settleBody([], on, 30, 20).orbit).toBeNull()
  })

  it('a new orbit catches the bodies lying on its path, and no others', () => {
    const o = orbit()
    const shapes = catchBodies([planet('on', 21.2, 10), planet('off', 3, 3), o], o, 30, 20)
    expect(shapes.find(s => s.id === 'on')!.orbit?.id).toBe('orb_a')
    expect(shapes.find(s => s.id === 'off')!.orbit ?? null).toBeNull()
  })
})

describe('orbits on a map', () => {
  it('is only on a map of space', () => {
    expect(isSpace(draft())).toBe(true)
    expect(isSpace(draft({ level: 'planetary' }))).toBe(false)
    expect(defaultsFor('galactic', 'metric').base).toEqual({ biome: 'space', height: 0 })
    expect(defaultsFor('intergalactic', 'metric').base.biome).toBe('space')
    // On a map of land nothing is caught.
    const land = draft({ level: 'regional', shapes: [orbit()] })
    expect(settled(land, planet('p', 21, 10)).orbit ?? null).toBeNull()
  })

  it('draws an orbit round a centre on the regions layer, catching a planet on its path, and nowhere when the layer is locked', () => {
    const d = draft({ shapes: [planet('bio_p', 21, 10)] })
    const r = addOrbit(d, 15, 10, 6, ids('a'))!
    expect(r.id).toBe('orb_a')
    const o = r.change.draft.shapes.find(s => s.id === 'orb_a')!
    expect(o).toMatchObject({ type: 'orbit', layerId: 'shapes', points: [], style: 'dashed', ellipse: { cx: 15, cy: 10, rx: 6, ry: 6, turn: 0 } })
    expect(bodiesOn(r.change.draft, 'orb_a').map(b => b.id)).toEqual(['bio_p'])
    expect(addOrbit(toggleLayer(d, 'shapes', 'locked')!.draft, 15, 10, 6)).toBeNull()
  })

  it('takes its bodies along when it grows, turns or moves, each at its own angle; one undo step', () => {
    let d = addOrbit(draft({ shapes: [planet('bio_p', 21, 10)] }), 15, 10, 6, ids('a'))!.change.draft
    const angle = d.shapes.find(s => s.id === 'bio_p')!.orbit!.angle
    const r = editOrbit(d, 'orb_a', { rx: 10, turn: 30 })!
    d = r.draft
    const o = d.shapes.find(s => s.id === 'orb_a')!
    const p = d.shapes.find(s => s.id === 'bio_p')!
    expect(p.orbit!.angle).toBe(angle)
    const m = middleOf(p)
    expect(distanceToPath(o.ellipse!, m.x, m.y)).toBeLessThan(0.02)
    expect(editOrbit(d, 'orb_a', { rx: 10 })).toBeNull()
    // Moving the orbit (a drag) takes the planet too.
    const moved = withShape(d, translateShape(o, -3, 0, 30, 20))
    expect(middleOf(moved.shapes.find(s => s.id === 'bio_p')!).x).toBeCloseTo(m.x - 3, 1)
  })

  it('lets its bodies go where they are when it is deleted, and a body can leave it', () => {
    const d = addOrbit(draft({ shapes: [planet('bio_p', 21, 10)] }), 15, 10, 6, ids('a'))!.change.draft
    const before = middleOf(d.shapes.find(s => s.id === 'bio_p')!)
    const gone = removeItem(d, { kind: 'shape', id: 'orb_a' })!.draft
    const p = gone.shapes.find(s => s.id === 'bio_p')!
    expect(p.orbit).toBeNull()
    expect(middleOf(p)).toEqual(before)
    expect(leaveOrbit(d, 'bio_p')!.draft.shapes.find(s => s.id === 'bio_p')!.orbit).toBeNull()
    expect(leaveOrbit(gone, 'bio_p')).toBeNull()
  })

  it('a planet of the library placed on an orbit path goes round on it, coloured by its kind', () => {
    const d = addOrbit(draft(), 15, 10, 6, ids('a'))!.change.draft
    const r = addLibraryShape(d, lib('space:planet'), { x0: 20.3, y0: 9.3, x1: 21.8, y1: 10.8 }, 'metric', ids('p'))!
    const p = r.change.draft.shapes.find(s => s.id === r.id)!
    expect(p).toMatchObject({ type: 'biome', biome: 'planet_rocky', kind: 'space:planet', orbit: { id: 'orb_a' } })
    // A star of the library goes on the biomes layer, a kind of star.
    const star = addLibraryShape(d, lib('space:star'), { x0: 14, y0: 9, x1: 16, y1: 11 }, 'metric', ids('s'))!
    expect(star.change.draft.shapes.find(s => s.id === star.id)).toMatchObject({ layerId: 'terrain', biome: 'star_yellow' })
  })
})
