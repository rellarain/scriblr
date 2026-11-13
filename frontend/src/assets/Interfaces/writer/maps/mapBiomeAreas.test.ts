import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { MapDoc, MapShape } from '../../../../api/types'
import {
  STARTER_BIOMES, UNKNOWN_BIOME_COLOR, biomeCounts, biomeIndex, levelsOfBiome, offeredBiomes, ownBiomeId, resolveBiome, usedBiomeIds,
} from './mapBiomes'
import { landHeight } from './mapHeights'
import { HEIGHT_LIMIT, addBiomeShape, addLibraryShape, editPlace, editShape, hitItem, moveShapeOrder, placeOf, placesOf } from './mapItems'
import { FEET_PER_METRE, LEVELS, MAP_LEVELS, defaultsFor, heightRangeOf, levelDef, levelsBelow, nextLevelDown } from './mapLevels'
import { draftOf, toggleLayer, type MapDraft } from './mapModel'
import { starterShapes } from './mapShapeSeed'
import { UNITS, changeUnits, formatHeight, heightUnit, roundNice, unitsOf } from './mapUnits'

const doc = (over: Partial<MapDoc> = {}): MapDoc => ({
  schemaVersion: 2, id: 'map_1', title: 'World', level: 'national', mapFormat: 2, base: { biome: 'plain', height: 0 }, units: 'metric',
  parentId: null, order: 0, width: 20, height: 10, cellSize: 10, unit: 'km', pace: null,
  layers: [
    { id: 'terrain', name: 'Biomes', kind: 'terrain', visible: true, locked: false },
    { id: 'shapes', name: 'Regions and lines', kind: 'shapes', visible: true, locked: false },
    { id: 'symbols', name: 'Markers', kind: 'symbols', visible: true, locked: false },
  ],
  labels: [], shapes: [], scaleBar: true, compass: true, legend: false, updatedAt: 'x', ...over,
})
const draft = (over: Partial<MapDoc> = {}): MapDraft => draftOf(doc(over))
const ids = (...seed: string[]) => { let n = 0; return () => seed[n++] ?? `x${n}` }
const TRI: Array<[number, number]> = [[2, 2], [8, 2], [5, 7]]
const here = path.dirname(fileURLToPath(import.meta.url))
const schema = () => readFileSync(path.resolve(here, '../../../../../../backend/app/storage/schema.py'), 'utf-8')

describe('the levels', () => {
  it('are the nine levels, largest first, and the next one down is a place\'s map by default', () => {
    expect(MAP_LEVELS).toEqual(['intergalactic', 'galactic', 'planetary', 'continental', 'national', 'regional', 'local', 'architectural', 'interior'])
    expect(nextLevelDown('planetary')).toBe('continental')
    expect(levelsBelow('local')).toEqual(['architectural', 'interior'])
    expect(nextLevelDown('interior')).toBe('interior')
    expect(levelDef('nope' as never).id).toBe('planetary')
  })

  it('give a new map its scale, base and size in either system', () => {
    expect(defaultsFor('continental', 'metric')).toEqual({ cellSize: 25, unit: 'km', base: { biome: 'saltwater', height: -200 }, width: 64, height: 48 })
    expect(defaultsFor('continental', 'imperial')).toMatchObject({ cellSize: 15, unit: 'mi', base: { biome: 'saltwater', height: Math.round(-200 * FEET_PER_METRE) } })
    expect(defaultsFor('interior', 'metric')).toMatchObject({ cellSize: 0.5, unit: 'm', base: { biome: 'wood', height: 0 } })
    expect(heightRangeOf('regional', 'metric')).toBe(2000)
    expect(heightRangeOf('regional', 'imperial')).toBeCloseTo(6561.7, 0)
    expect(heightRangeOf('galactic', 'metric')).toBe(0)
  })

  it('match the server\'s level table (MAP_LEVEL_DEFAULTS in schema.py)', () => {
    const text = schema()
    for (const lv of LEVELS) {
      const row = new RegExp(`"${lv.id}": _LevelDefaults\\(kind="\\w+", base="(\\w+)", baseHeight=(-?\\d+), heightRange=(\\d+), metric=\\(([\\d.]+), "(\\w+)"\\), imperial=\\(([\\d.]+), "(\\w+)"\\)`).exec(text)
      expect(row, lv.id).not.toBeNull()
      const [, base, baseHeight, range, mCell, mUnit, iCell, iUnit] = row!
      expect([lv.base, lv.baseHeight, lv.heightRange, lv.metric.cell, lv.metric.unit, lv.imperial.cell, lv.imperial.unit], lv.id)
        .toEqual([base, Number(baseHeight), Number(range), Number(mCell), mUnit, Number(iCell), iUnit])
    }
  })
})

describe('the units', () => {
  it('offer the units of a system, and heights in metres or feet', () => {
    expect(unitsOf('metric').map(u => u.id)).toEqual(['km', 'm', 'ly', 'AU'])
    expect(unitsOf('imperial').map(u => u.id)).toEqual(['mi', 'yd', 'ft', 'ly', 'AU'])
    expect(unitsOf('custom')).toEqual(UNITS.filter(u => u.system === 'both'))
    expect(heightUnit('imperial')).toBe('ft')
    expect(heightUnit('custom')).toBe('m')
    expect(formatHeight(1250.4, 'metric')).toBe('1,250 m')
  })

  it('round a converted number to three figures', () => {
    expect(roundNice(15.5343)).toBe(15.5)
    expect(roundNice(0.031069)).toBe(0.0311)
    expect(roundNice(62137.1)).toBe(62137)
    expect(roundNice(0)).toBe(0)
    expect(roundNice(Number.NaN)).toBe(0)
  })

  it('convert there and back to about the same numbers', () => {
    const d = doc({ cellSize: 10, unit: 'km', pace: 30, base: { biome: 'plain', height: 120 } })
    const there = changeUnits(d, 'imperial', 'convert')
    const back = changeUnits({ ...d, ...there }, 'metric', 'convert')
    expect(back.unit).toBe('km')
    expect(back.cellSize).toBeCloseTo(10, 1)
    expect(back.pace!).toBeCloseTo(30, 0)
    expect(Math.abs(back.base.height - 120)).toBeLessThanOrEqual(1)
  })

  it('keep a unit of both systems, and change nothing going into custom', () => {
    const space = doc({ level: 'galactic', unit: 'AU', cellSize: 0.1 })
    expect(changeUnits(space, 'imperial', 'convert')).toMatchObject({ unit: 'AU', cellSize: 0.1 })
    expect(changeUnits(doc(), 'custom', 'convert')).toMatchObject({ units: 'custom', unit: 'km', cellSize: 10 })
    // Out of custom the level's own unit is taken, and the numbers are kept.
    expect(changeUnits(doc({ units: 'custom', unit: 'leagues', cellSize: 3 }), 'imperial', 'convert')).toMatchObject({ unit: 'mi', cellSize: 3 })
  })
})

describe('the biomes', () => {
  const own = { id: 'own_ab12', name: 'Glass dunes', color: '#cfd8e0', group: 'land' as const, levels: [], retired: false }
  const index = biomeIndex(STARTER_BIOMES, [own, { ...own, id: 'own_old', name: 'Old', retired: true }])

  it('resolve the project\'s own first, then the admin\'s, and an unknown id to gray', () => {
    expect(resolveBiome(index, 'own_ab12').name).toBe('Glass dunes')
    expect(resolveBiome(index, 'forest').color).toBe('#3f8f3a')
    expect(resolveBiome(index, 'gone')).toMatchObject({ name: 'Unknown biome', color: UNKNOWN_BIOME_COLOR })
    expect(resolveBiome(biomeIndex(STARTER_BIOMES, [{ ...own, id: 'forest', name: 'My forest' }]), 'forest').name).toBe('My forest')
  })

  it('offer a level the biomes of its groups, and none that are retired', () => {
    expect(offeredBiomes(index, 'regional').map(b => b.id)).toEqual(expect.arrayContaining(['saltwater', 'forest', 'urban', 'own_ab12']))
    expect(offeredBiomes(index, 'regional').map(b => b.id)).not.toContain('carpet')
    expect(offeredBiomes(index, 'regional').map(b => b.id)).not.toContain('own_old')
    expect(offeredBiomes(index, 'interior').map(b => b.id)).toEqual(expect.arrayContaining(['wood', 'carpet', 'freshwater', 'dirt']))
    expect(offeredBiomes(index, 'interior').map(b => b.id)).not.toContain('forest')
    // A star system offers space, the kinds of star and the kinds of planet; between star systems, no planets.
    const galactic = offeredBiomes(index, 'galactic').map(b => b.id)
    expect(galactic).toEqual(expect.arrayContaining(['space', 'star_yellow', 'star_black_hole', 'planet_garden', 'planet_gas_giant']))
    expect(galactic).not.toContain('forest')
    expect(offeredBiomes(index, 'intergalactic').map(b => b.id)).toEqual(expect.arrayContaining(['space', 'star_red']))
    expect(offeredBiomes(index, 'intergalactic').map(b => b.id)).not.toContain('planet_ice')
    expect(offeredBiomes(index, 'planetary').map(b => b.id)).not.toContain('star_yellow')
    expect(levelsOfBiome(STARTER_BIOMES.find(b => b.id === 'paving')!)).toEqual(['local', 'architectural', 'interior'])
  })

  it('know which biomes a map uses and how many areas each has', () => {
    const shapes = [{ type: 'biome', biome: 'forest' }, { type: 'biome', biome: 'forest' }, { type: 'biome', biome: null }, { type: 'region' }] as MapShape[]
    expect(usedBiomeIds({ base: { biome: 'plain', height: 0 }, shapes })).toEqual(['plain', 'forest'])
    expect([...biomeCounts({ shapes })]).toEqual([['forest', 2]])
  })

  it('give a new biome of the project an "own_" id no other has', () => {
    expect(ownBiomeId(['own_a'], ids('a', 'b'))).toBe('own_b')
  })

  it('start with the server\'s starter list (MAP_BIOME_SEED in schema.py), same ids, names, colours and groups', () => {
    const text = schema()
    const start = text.indexOf('MAP_BIOME_SEED: list')
    const block = text.slice(start, text.indexOf('\n]', start))
    const rows = [...block.matchAll(/\("(\w+)", "([^"]+)", "(#[0-9a-f]{6})", "(\w+)"/g)].map(m => [m[1], m[2], m[3], m[4]])
    expect(rows.length).toBeGreaterThan(20)
    expect(STARTER_BIOMES.map(b => [b.id, b.name, b.color, b.group])).toEqual(rows)
  })
})

describe('the height of the land', () => {
  it('sets, raises or lowers it; land never sits under the sea, water keeps the depth', () => {
    expect(landHeight(-200, { biome: 'forest', heightMode: 'none', height: 0 }, 'land')).toBe(0)
    expect(landHeight(-200, { biome: 'saltwater', heightMode: 'none', height: 0 }, 'water')).toBe(-200)
    expect(landHeight(1200, { biome: 'forest', heightMode: 'none', height: 0 }, 'land')).toBe(1200)
    expect(landHeight(-200, { biome: 'rocky', heightMode: 'raise', height: 2500 }, 'land')).toBe(2500)
    expect(landHeight(300, { biome: 'swamp', heightMode: 'lower', height: 100 }, 'land')).toBe(200)
    expect(landHeight(300, { biome: 'plain', heightMode: 'set', height: -50 }, 'land')).toBe(-50)
    // A shape with no biome of its own only changes the height of what is under it.
    expect(landHeight(-200, { biome: null, heightMode: 'raise', height: 500 }, null)).toBe(300)
  })
})

describe('biome areas', () => {
  it('are drawn on the biomes layer with the chosen biome, at least three points, held to the map', () => {
    const r = addBiomeShape(draft(), [[2, 2], [30, 2], [5, -4]], 'forest', true, ids('a'))!
    const [s] = r.change.draft.shapes
    expect(r.id).toBe('bio_a')
    expect(s).toMatchObject({ type: 'biome', layerId: 'terrain', biome: 'forest', heightMode: 'none', height: 0, name: '', mapIds: [] })
    expect(s.points.map(p => [p.x, p.y, p.smooth])).toEqual([[2, 2, true], [20, 2, true], [5, 0, true]])
    expect(addBiomeShape(draft(), [[1, 1], [2, 2]], 'forest', false)).toBeNull()
    expect(addBiomeShape(toggleLayer(draft(), 'terrain', 'locked')!.draft, TRI, 'forest', false)).toBeNull()
  })

  it('take an id no other shape has (a marker, say)', () => {
    const castle = starterShapes().find(s => s.id === 'marker:castle')!
    const d = addLibraryShape(draft(), castle, { x0: 1, y0: 1, x1: 3, y1: 3 }, 'metric', ids('a'))!.change.draft
    const clash = addBiomeShape({ ...d, shapes: [{ ...d.shapes[0], id: 'bio_a' }] }, TRI, 'forest', false, ids('a', 'b'))!
    expect(clash.id).toBe('bio_b')
  })

  it('change their biome and height; a height is rounded and held to its limit', () => {
    const d = addBiomeShape(draft(), TRI, 'forest', false, ids('a'))!.change.draft
    expect(editShape(d, 'bio_a', { biome: null })!.draft.shapes[0].biome).toBeNull()
    expect(editShape(d, 'bio_a', { heightMode: 'raise', height: 1234.6 })!.draft.shapes[0]).toMatchObject({ heightMode: 'raise', height: 1235 })
    expect(editShape(d, 'bio_a', { height: 10 ** 9 })!.draft.shapes[0].height).toBe(HEIGHT_LIMIT)
  })

  it('come to the front or go to the back of their layer', () => {
    let d = draft()
    for (const id of ['a', 'b', 'c']) d = addBiomeShape(d, TRI, 'forest', false, ids(id))!.change.draft
    expect(moveShapeOrder(d, 'bio_a', 'front')!.draft.shapes.map(s => s.id)).toEqual(['bio_b', 'bio_c', 'bio_a'])
    expect(moveShapeOrder(d, 'bio_c', 'back')!.draft.shapes.map(s => s.id)).toEqual(['bio_c', 'bio_a', 'bio_b'])
    expect(moveShapeOrder(d, 'bio_c', 'front')).toBeNull()
  })

  it('are picked inside their outline, the one on top first', () => {
    let d = addBiomeShape(draft(), TRI, 'forest', false, ids('a'))!.change.draft
    d = addBiomeShape(d, [[4, 3], [7, 3], [5, 6]], 'freshwater', false, ids('b'))!.change.draft
    expect(hitItem(d, 5, 4)).toEqual({ kind: 'shape', id: 'bio_b' })
    expect(hitItem(d, 3, 2.5)).toEqual({ kind: 'shape', id: 'bio_a' })
    expect(hitItem(d, 15, 8)).toBeNull()
  })

  it('are places once they are named, and open the maps given them', () => {
    const d = addBiomeShape(draft(), TRI, 'forest', false, ids('a'))!.change.draft
    expect(placesOf(d)).toEqual([])
    const named = editPlace(d, { kind: 'shape', id: 'bio_a' }, { name: '  Greenwood ', mapIds: ['m1', 'm1', 'm2'] })!.draft
    expect(placesOf(named)).toEqual([{ ref: { kind: 'shape', id: 'bio_a' }, name: 'Greenwood', mapIds: ['m1', 'm2'] }])
    expect(placeOf(named, { kind: 'shape', id: 'bio_a' })).toEqual({ name: 'Greenwood', mapIds: ['m1', 'm2'] })
    expect(editPlace(named, { kind: 'shape', id: 'bio_a' }, { name: 'Greenwood' })).toBeNull()
  })
})
