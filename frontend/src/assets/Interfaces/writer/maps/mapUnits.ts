import type { MapDoc, MapShape, MapUnits } from '../../../../api/types'
import { FEET_PER_METRE, levelDef } from './mapLevels'

// The units of a map: metric and imperial convert into each other (the size of a cell, a day's travel, every height); a custom unit (paces, leagues, cells
// ...) is kept as written. Light years and astronomical units are the same in both systems.

export interface UnitDef { id: string; name: string; system: 'metric' | 'imperial' | 'both'; metres: number }

export const UNITS: UnitDef[] = [
  { id: 'km', name: 'kilometres', system: 'metric', metres: 1000 },
  { id: 'm', name: 'metres', system: 'metric', metres: 1 },
  { id: 'mi', name: 'miles', system: 'imperial', metres: 1609.344 },
  { id: 'yd', name: 'yards', system: 'imperial', metres: 0.9144 },
  { id: 'ft', name: 'feet', system: 'imperial', metres: 0.3048 },
  { id: 'ly', name: 'light years', system: 'both', metres: 9.4607e15 },
  { id: 'AU', name: 'astronomical units', system: 'both', metres: 1.495978707e11 },
]

export const unitDef = (id: string): UnitDef | undefined => UNITS.find(u => u.id === id)

// The units a map of a unit system can be measured in (custom: any text).
export const unitsOf = (system: MapUnits): UnitDef[] => UNITS.filter(u => u.system === system || u.system === 'both')

// The unit that stands for `unit` in the other system (km <-> mi, m <-> ft, yd -> m); a unit of both systems stays.
const COUNTERPART: Record<string, string> = { km: 'mi', mi: 'km', m: 'ft', ft: 'm', yd: 'm' }

// The unit heights are in: feet on an imperial map, metres otherwise.
export const heightUnit = (units: MapUnits | undefined): 'm' | 'ft' => (units === 'imperial' ? 'ft' : 'm')

// A number rounded to three significant figures (what a converted cell size or pace reads as).
export function roundNice(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0
  const digits = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(value))))
  return Number(value.toFixed(Math.min(digits, 6)))
}

export const formatHeight = (value: number, units: MapUnits | undefined): string => `${Math.round(value).toLocaleString('en')} ${heightUnit(units)}`

export type ConvertMode = 'convert' | 'keep'

export interface UnitChange { units: MapUnits; unit: string; cellSize: number; pace: number | null; base: MapDoc['base']; shapes: MapShape[] }

// A map moved to another unit system. `convert` turns every number into the new units (1 cell: 10 km -> 6.21 mi; heights m -> ft); `keep` keeps the numbers
// and only renames the units (10 km -> 10 mi). Into custom nothing changes but the system; out of custom the level's own unit is taken, numbers kept.
export function changeUnits(doc: Pick<MapDoc, 'units' | 'unit' | 'cellSize' | 'pace' | 'base' | 'shapes' | 'level'>, to: MapUnits, mode: ConvertMode): UnitChange {
  const same = { units: to, unit: doc.unit, cellSize: doc.cellSize, pace: doc.pace, base: doc.base, shapes: doc.shapes }
  if (to === doc.units) return same
  if (to === 'custom') return same
  if (doc.units === 'custom') {
    const def = levelDef(doc.level)
    return { ...same, unit: to === 'imperial' ? def.imperial.unit : def.metric.unit }
  }
  const from = unitDef(doc.unit)
  const unit = from?.system === 'both' ? doc.unit : COUNTERPART[doc.unit] ?? (to === 'imperial' ? 'mi' : 'km')
  if (mode === 'keep' || !from) return { ...same, unit }
  const target = unitDef(unit)!
  const length = (n: number) => roundNice((n * from.metres) / target.metres)
  const height = (h: number) => Math.round(to === 'imperial' ? h * FEET_PER_METRE : h / FEET_PER_METRE)
  return {
    units: to,
    unit,
    cellSize: length(doc.cellSize),
    pace: doc.pace === null ? null : length(doc.pace),
    base: { ...doc.base, height: height(doc.base.height) },
    shapes: doc.shapes.map(s => (s.type === 'biome' && s.height ? { ...s, height: height(s.height) } : s)),
  }
}
