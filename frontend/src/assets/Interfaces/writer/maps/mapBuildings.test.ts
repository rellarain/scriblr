import { describe, expect, it } from 'vitest'
import type { MapDoc, MapShape, MapSummary } from '../../../../api/types'
import { addOpening } from './mapItems'
import { buildingOf, cleanFloor, floorName, floorsOf, nextFloorOrder } from './mapFloors'
import { draftOf, setFloor, type MapDraft } from './mapModel'
import { editOpening, gapsOf, isWall, openingPlace, openingsAfterInsert, openingsAfterRemove, pieceLengths, withOpening, withoutOpening } from './mapOpenings'
import { insertPoint, movePoint, removePoint, translateShape } from './mapShapes'

const row = (id: string, over: Partial<MapSummary> = {}): MapSummary => ({ id, title: id, level: 'architectural', parentId: null, order: 0, width: 16, height: 12, updatedAt: 'x', ...over })
const corner = (x: number, y: number) => ({ x, y, smooth: false, hx: null, hy: null })
// A wall round three sides of a room: pieces of 12, 8 and 12 cells.
const wall = (over: Partial<MapShape> = {}): MapShape => ({
  id: 'shp_w', layerId: 'shapes', type: 'line', points: [corner(2, 2), corner(14, 2), corner(14, 10), corner(2, 10)], style: 'wall', color: null, width: 0.22, fill: null, opacity: 0.35, pattern: 'solid', ...over,
})
const doc = (over: Partial<MapDoc> = {}): MapDoc => ({
  schemaVersion: 2, id: 'map_inn', title: 'Inn', level: 'architectural', mapFormat: 3, base: { biome: 'outside', height: 0 }, units: 'metric',
  parentId: null, order: 0, width: 16, height: 12, cellSize: 1, unit: 'm', pace: null,
  layers: [
    { id: 'terrain', name: 'Biomes', kind: 'terrain', visible: true, locked: false },
    { id: 'shapes', name: 'Regions and lines', kind: 'shapes', visible: true, locked: false },
  ],
  labels: [], shapes: [], scaleBar: false, compass: false, legend: false, updatedAt: 'x', ...over,
})
const draft = (over: Partial<MapDoc> = {}): MapDraft => draftOf(doc(over))

describe('the floors of a building', () => {
  const maps = [
    row('inn', { title: 'Inn' }), row('f1', { parentId: 'inn', floor: { order: 1, name: '' } }), row('b1', { parentId: 'inn', floor: { order: -1, name: '' } }),
    row('g', { parentId: 'inn', floor: { order: 0, name: 'Tap room' } }), row('room', { parentId: 'g', level: 'interior' }), row('town', { level: 'local' }),
  ]

  it('are named by their place unless they have a name of their own', () => {
    expect(floorName({ order: 0, name: '' })).toBe('Ground floor')
    expect(floorName({ order: 3, name: '' })).toBe('Floor 3')
    expect(floorName({ order: -2, name: '  ' })).toBe('Basement 2')
    expect(floorName({ order: 1, name: ' Guest rooms ' })).toBe('Guest rooms')
  })

  it('belong to the building they are inside, and a building to itself; other maps to none', () => {
    expect(buildingOf(maps, 'f1')!.id).toBe('inn')
    expect(buildingOf(maps, 'inn')!.id).toBe('inn')
    expect(buildingOf(maps, 'room')).toBeNull()
    expect(buildingOf(maps, 'town')).toBeNull()
    expect(buildingOf(maps, 'gone')).toBeNull()
  })

  it('are listed lowest first, and a new one goes above the highest (the ground floor when there is none)', () => {
    expect(floorsOf(maps, 'inn').map(f => f.id)).toEqual(['b1', 'g', 'f1'])
    expect(nextFloorOrder(floorsOf(maps, 'inn'))).toBe(2)
    expect(nextFloorOrder([])).toBe(0)
    const full = Array.from({ length: 24 }, (_, k) => ({ floor: { order: k - 3, name: '' } }))
    expect(nextFloorOrder(full)).toBeNull()
    expect(nextFloorOrder(full.filter(f => f.floor.order !== 5))).toBe(5)
  })

  it('keep their place in range and their name short, and only a floor has them', () => {
    expect(cleanFloor({ order: 99 })).toEqual({ order: 20, name: '' })
    expect(cleanFloor({ order: -7.6, name: 'x'.repeat(60) })).toEqual({ order: -3, name: 'x'.repeat(40) })
    const floor = draft({ floor: { order: 0, name: '' }, parentId: 'inn' })
    expect(setFloor(floor, { order: 2 })!.draft.floor).toEqual({ order: 2, name: '' })
    expect(setFloor(floor, { order: 0 })).toBeNull()
    expect(setFloor(draft(), { order: 2 })).toBeNull()
  })
})

describe('doors, windows and arches in a wall', () => {
  it('go only in a wall, on the piece nearest the click, kept inside it', () => {
    expect(isWall(wall())).toBe(true)
    expect(isWall(wall({ style: 'solid' }))).toBe(false)
    expect(pieceLengths(wall())).toEqual([12, 8, 12])
    expect(openingPlace(wall(), 8, 2.2, 1)).toEqual({ seg: 0, t: 0.5 })
    // At the very end of a piece the opening is kept whole inside it.
    expect(openingPlace(wall(), 14, 9.9, 2)).toEqual({ seg: 1, t: 0.875 })
    const w = withOpening(wall(), 8, 2.2, 'door', 1.2, 'opn_a')!
    expect(w.openings).toEqual([{ id: 'opn_a', seg: 0, t: 0.5, width: 1.2, kind: 'door', flip: false }])
    expect(withOpening(wall({ style: 'dashed' }), 8, 2.2, 'door', 1, 'x')).toBeNull()
  })

  it('change their kind, width, place and side within range, and are taken away', () => {
    const w = withOpening(wall(), 8, 2, 'door', 1, 'opn_a')!
    expect(editOpening(w, 'opn_a', { kind: 'window', width: 20, t: 1.4, flip: true })!.openings![0]).toEqual({ id: 'opn_a', seg: 0, t: 1, width: 8, kind: 'window', flip: true })
    expect(editOpening(w, 'opn_a', { width: 1 })).toBeNull()
    expect(editOpening(w, 'nope', { width: 2 })).toBeNull()
    expect(withoutOpening(w, 'opn_a').openings).toEqual([])
  })

  it('stay on their piece when the wall is moved or a point is dragged', () => {
    const w = withOpening(wall(), 8, 2, 'window', 2, 'opn_a')!
    expect(translateShape(w, 1, 1, 16, 12).openings).toEqual(w.openings)
    expect(movePoint(w, 1, 15, 3).openings).toEqual(w.openings)
  })

  it('move to the right piece when a point is put in or taken away', () => {
    const w = withOpening(withOpening(wall(), 11, 2, 'door', 1, 'opn_a')!, 14, 6, 'window', 1, 'opn_b')!
    // A point in the middle of the first piece: the door (three quarters along) is on the second half now; the window moves up a piece.
    const more = insertPoint(w, 0, 0.5)!
    expect(more.openings!.map(o => [o.id, o.seg, o.t])).toEqual([['opn_a', 1, 0.5], ['opn_b', 2, 0.5]])
    expect(openingsAfterInsert([{ id: 'x', seg: 0, t: 0.2, width: 1, kind: 'door', flip: false }], 0, 0.5)![0]).toMatchObject({ seg: 0, t: 0.4 })
    // The corner between the first two pieces taken away: both pieces become one.
    const less = removePoint(w, 1)!
    expect(less.openings!.map(o => [o.id, o.seg])).toEqual([['opn_a', 0], ['opn_b', 0]])
    // The first point taken away: the first piece goes, and the door on it.
    expect(openingsAfterRemove(w.openings, 0, 3)!.map(o => [o.id, o.seg])).toEqual([['opn_b', 0]])
  })

  it('leave gaps in the wall where they are, in order along each piece', () => {
    const w = withOpening(withOpening(wall(), 11, 2, 'door', 1.2, 'opn_a')!, 5, 2, 'window', 2, 'opn_b')!
    const gaps = gapsOf(w).get(0)!
    expect(gaps.map(g => g.opening.id)).toEqual(['opn_b', 'opn_a'])
    expect(gaps[0].from).toBeCloseTo((3 - 1) / 12, 6)
    expect(gaps[0].to).toBeCloseTo((3 + 1) / 12, 6)
  })

  it('are put in the wall under a click on the map, as one change; elsewhere nothing', () => {
    const d = draft({ shapes: [wall()] })
    const r = addOpening(d, 14.1, 6, 'window', 1.5, () => 'a')!
    expect(r.wallId).toBe('shp_w')
    expect(r.id).toBe('opn_a')
    expect(r.change.draft.shapes[0].openings).toEqual([{ id: 'opn_a', seg: 1, t: 0.5, width: 1.5, kind: 'window', flip: false }])
    expect(addOpening(d, 8, 6, 'door', 1)).toBeNull()
    expect(addOpening(draft({ shapes: [wall({ style: 'solid' })] }), 14.1, 6, 'door', 1)).toBeNull()
  })
})
