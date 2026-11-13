import type { ModelContent, WriterModelLimits } from '../../../../../api/types'
import { LIMITS, copyBytes } from './limits'

// The limits the admin sets for the models a writer designs for themselves (phase 7b). Each is held between a floor, which keeps a model possible, and the admin's own limit
// (LIMITS), which is its ceiling and what it starts at, so a writer is held to nothing more than the admin until the admin says so. The server keeps the same table
// (schema.py WRITER_LIMITS) and checks a model against it when it is published; the page checks a model as it is edited, so a writer is stopped at the limit rather than told at
// Publish. A draft may be over a limit (a writer can duplicate a big model and trim it), and so may a published model after the admin lowers a limit: only an edit that makes a
// count grow past a limit is refused, and only a new version is refused at Publish.

export type WriterLimitKey = keyof WriterModelLimits

export interface WriterLimitRow {
  key: WriterLimitKey
  label: string
  // the least it may be set to, and the most (the admin's own limit)
  floor: number
  ceiling: number
  // How far one click on a stepper moves it, and Shift with a click.
  step: number
  big: number
}

export const WRITER_LIMIT_ROWS: WriterLimitRow[] = [
  { key: 'points', label: 'Points in a shape', floor: 3, ceiling: LIMITS.pointsMax, step: 1, big: 5 },
  { key: 'shapesPerObject', label: 'Shapes in an object', floor: 1, ceiling: LIMITS.shapesPerObjectMax, step: 1, big: 6 },
  { key: 'objectsPerGroup', label: 'Objects in a group', floor: 1, ceiling: LIMITS.objectsPerGroupMax, step: 1, big: 4 },
  { key: 'shapes', label: 'Shapes in a model', floor: 1, ceiling: LIMITS.shapesMax, step: 10, big: 50 },
  { key: 'objects', label: 'Objects in a model', floor: 1, ceiling: LIMITS.objectsMax, step: 5, big: 20 },
  { key: 'groups', label: 'Groups in a model', floor: 1, ceiling: LIMITS.groupsMax, step: 5, big: 20 },
  { key: 'sliders', label: 'Sliders in a model', floor: 0, ceiling: LIMITS.rangesMax, step: 5, big: 20 },
  { key: 'copyKb', label: 'Size of a character\'s copy of a model (KB)', floor: 16, ceiling: LIMITS.copyMaxBytes / 1024, step: 64, big: 256 },
  { key: 'models', label: 'Models in a writer\'s library', floor: 1, ceiling: LIMITS.modelsMax, step: 1, big: 5 },
]

const ROW = new Map(WRITER_LIMIT_ROWS.map(r => [r.key, r]))

// Every limit at its ceiling: the admin's own.
export function defaultWriterLimits(): WriterModelLimits {
  return Object.fromEntries(WRITER_LIMIT_ROWS.map(r => [r.key, r.ceiling])) as unknown as WriterModelLimits
}

// What the server keeps of whatever it is given: a whole number between each limit's floor and ceiling, and the ceiling for what is missing or not a number.
export function normalizeWriterLimits(raw: Partial<Record<WriterLimitKey, unknown>> | null | undefined): WriterModelLimits {
  const out: Record<string, number> = {}
  for (const r of WRITER_LIMIT_ROWS) {
    const v = raw?.[r.key]
    out[r.key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(r.ceiling, Math.max(r.floor, Math.trunc(v))) : r.ceiling
  }
  return out as unknown as WriterModelLimits
}

// One limit stepped up or down (by `big` with Shift), held between its floor and ceiling.
export function stepWriterLimit(limits: WriterModelLimits, key: WriterLimitKey, dir: -1 | 1, big: boolean): WriterModelLimits {
  const r = ROW.get(key)!
  return normalizeWriterLimits({ ...limits, [key]: limits[key] + dir * (big ? r.big : r.step) })
}

// Whether the admin has held writers to less than the admin's own limits.
export const isTightened = (limits: WriterModelLimits): boolean => WRITER_LIMIT_ROWS.some(r => limits[r.key] < r.ceiling)

// The most the page lets one count grow to: the writer's limit in a writer's designer, else the admin's own.
export interface DesignerMax {
  points: number
  shapesPerObject: number
  objectsPerGroup: number
  shapes: number
  objects: number
  groups: number
  sliders: number
}
export function designerMax(limits: WriterModelLimits | null): DesignerMax {
  return {
    points: limits?.points ?? LIMITS.pointsMax, shapesPerObject: limits?.shapesPerObject ?? LIMITS.shapesPerObjectMax, objectsPerGroup: limits?.objectsPerGroup ?? LIMITS.objectsPerGroupMax,
    shapes: limits?.shapes ?? LIMITS.shapesMax, objects: limits?.objects ?? LIMITS.objectsMax, groups: limits?.groups ?? LIMITS.groupsMax, sliders: limits?.sliders ?? LIMITS.rangesMax,
  }
}

// Said when the writer's library holds as many models as the admin allows.
export const libraryFull = (most: number): string => `Your library is full: the admin allows at most ${most} model${most === 1 ? '' : 's'}.`

// ---- how big a model is, by the measures that are limited ----

export function measures(content: ModelContent): DesignerMax {
  return {
    points: content.shapes.reduce((n, s) => Math.max(n, s.pts.length), 0),
    shapesPerObject: content.objects.reduce((n, o) => Math.max(n, o.shapes.length), 0),
    objectsPerGroup: content.groups.reduce((n, g) => Math.max(n, g.objects.length), 0),
    shapes: content.shapes.length, objects: content.objects.length, groups: content.groups.length, sliders: content.ranges.length,
  }
}

const SAYS: Record<keyof DesignerMax, (n: number) => string> = {
  points: n => `A shape in a model of your own may have at most ${n} points.`,
  shapesPerObject: n => `An object in a model of your own may have at most ${n} shapes.`,
  objectsPerGroup: n => `A group in a model of your own may have at most ${n} objects.`,
  shapes: n => `A model of your own may have at most ${n} shapes.`,
  objects: n => `A model of your own may have at most ${n} objects.`,
  groups: n => `A model of your own may have at most ${n} groups.`,
  sliders: n => `A model of your own may have at most ${n} sliders.`,
}

// Why an edit that turns `prev` into `next` cannot be made, or null: it makes a count grow past a limit the admin set. A count that is over a limit already may stay as it is
// and may go down, so a big model that was duplicated can be trimmed.
export function growthRefusal(prev: ModelContent, next: ModelContent, limits: WriterModelLimits): string | null {
  const was = measures(prev), now = measures(next)
  for (const key of Object.keys(SAYS) as Array<keyof DesignerMax>) {
    if (now[key] > limits[key] && now[key] > was[key]) return SAYS[key](limits[key])
  }
  return null
}

// What stops a model of the writer's own from being published beyond what publishFaults says. The words are the server's (writer_limit_faults), line for line.
export function writerFaults(content: ModelContent, limits: WriterModelLimits): string[] {
  const faults: string[] = []
  const mine = 'the limit for a model of your own is'
  for (const s of content.shapes) if (s.pts.length > limits.points) faults.push(`Shape ${s.name || s.id} has ${s.pts.length} points: ${mine} ${limits.points}.`)
  for (const o of content.objects) if (o.shapes.length > limits.shapesPerObject) faults.push(`Object ${o.name || o.id} has ${o.shapes.length} shapes: ${mine} ${limits.shapesPerObject}.`)
  for (const g of content.groups) if (g.objects.length > limits.objectsPerGroup) faults.push(`Group ${g.name || g.id} has ${g.objects.length} objects: ${mine} ${limits.objectsPerGroup}.`)
  const totals: Array<[number, number, string]> = [[content.shapes.length, limits.shapes, 'shapes'], [content.objects.length, limits.objects, 'objects'], [content.groups.length, limits.groups, 'groups'], [content.ranges.length, limits.sliders, 'sliders']]
  for (const [count, most, what] of totals) if (count > most) faults.push(`The model has ${count} ${what}: ${mine} ${most}.`)
  const bytes = copyBytes(content)
  // past the admin's own limit publishFaults has said so already
  if (bytes > limits.copyKb * 1024 && bytes <= LIMITS.copyMaxBytes) faults.push(`A character's copy of this model would be ${Math.floor(bytes / 1024)} KB; ${mine} ${limits.copyKb} KB.`)
  return faults
}
