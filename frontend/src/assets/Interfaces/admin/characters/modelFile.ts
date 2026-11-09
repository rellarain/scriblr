import type { ModelContent, ModelDrive, ModelGroup, ModelMove, ModelObject, ModelPoint, ModelRange, ModelShape } from '../../../../api/types'
import { LIMITS } from './engine/limits'
import { blankContent, normalizeContent } from './modelContent'

// The file Export writes and Import reads: JSON with a marker and a version, and the models' content as it is (a shape, object, group or slider keeps its
// id: the ids only mean something inside one model). Everything read is held to what the server accepts, so one bad model can never make the whole save
// fail: a model that cannot be used is skipped and said so.
export const FILE_MARKER = 'scriblrCharacterModels'
export const FILE_VERSION = 1

// A problem with the file as a whole: nothing is imported.
export class ModelFileError extends Error {}

export interface ModelImport {
  models: ModelContent[]
  // Why a model in the file was left out, one sentence each ("The model at position 2 has no name.").
  skipped: string[]
}

const MOST = { shapes: 600, objects: 200, groups: 60 } as const
const ID = /^[A-Za-z0-9_.-]{1,80}$/
const MODES = ['c', 's', 'cs', 'sc']

export function serializeModels(models: ModelContent[], now: Date = new Date()): string {
  return `${JSON.stringify({ [FILE_MARKER]: FILE_VERSION, exportedAt: now.toISOString(), models: models.map(normalizeContent) }, null, 2)}\n`
}

export function exportFileName(models: ModelContent[]): string {
  if (models.length !== 1) return 'scriblr-character-models.json'
  const slug = models[0].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `scriblr-character-model-${slug || 'model'}.json`
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown, fallback: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback)
const idOf = (v: unknown): string | null => (typeof v === 'string' && ID.test(v) ? v : null)
const idOrNull = (v: unknown): string | null => idOf(v)
const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 ? [num(v[0], 0, -200, 200), num(v[1], 0, -200, 200)] : null)

function point(v: unknown): ModelPoint {
  const p = isRecord(v) ? v : {}
  const out: ModelPoint = { x: num(p.x, 0, -50, 250), y: num(p.y, 0, -50, 450), m: (MODES.includes(p.m as string) ? p.m : 'c') as ModelPoint['m'], hi: pair(p.hi), ho: pair(p.ho) }
  if (typeof p.w === 'number') out.w = num(p.w, 0, 0, 1)
  return out
}

function shape(v: Record<string, unknown>, id: string): ModelShape {
  const view = v.view === 'front' || v.view === 'back' ? v.view : 'both'
  return {
    id, name: text(v.name), closed: v.closed !== false, z: num(v.z, 40, 0, 100), op: num(v.op, 1, 0, 1), view, pts: list(v.pts).map(point),
    half: Math.round(num(v.half, 0, 0, LIMITS.pointsMax)), template: idOrNull(v.template),
  }
}

function move(v: unknown): ModelMove {
  const m = isRecord(v) ? v : {}
  return { i: Math.round(num(m.i, 0, 0, LIMITS.pointsMax - 1)), dx: num(m.dx, 0, -200, 200), dy: num(m.dy, 0, -200, 200), dxMin: num(m.dxMin, 0, -200, 200), dyMin: num(m.dyMin, 0, -200, 200) }
}

// A drive the server would accept, or null (the server drops the same ones).
function drive(v: unknown): ModelDrive | null {
  if (!isRecord(v) || !['turn', 'scale', 'points', 'bend'].includes(v.kind as string)) return null
  const kind = v.kind as ModelDrive['kind']
  const group = idOf(v.group), id = idOf(v.id), shapeId = idOf(v.shape)
  const target = v.target === 'group' || v.target === 'shape' || v.target === 'model' ? v.target : null
  if (kind === 'turn' && !group) return null
  if (kind === 'scale' && (!target || (target !== 'model' && !id))) return null
  if ((kind === 'points' || kind === 'bend') && !shapeId) return null
  const scale = kind === 'scale'
  const at = (x: unknown) => (scale ? num(x, 100, 5, 1000) : num(x, 0, -360, 360))
  const y0 = num(v.y0, 0, -50, 450), y1 = num(v.y1, 0, -50, 450)
  return {
    kind, group, target, id, axis: v.axis === 'x' || v.axis === 'y' ? v.axis : 'xy', shape: shapeId,
    moves: list(v.moves).slice(0, LIMITS.pointsMax).map(move), sym: v.sym === true,
    pivot: kind === 'bend' ? (pair(v.pivot) ?? [100, 200]) : pair(v.pivot), y0: Math.min(y0, y1), y1: Math.max(y0, y1), atMin: at(v.atMin), atMax: at(v.atMax), mirror: v.mirror !== false,
  }
}

function range(v: Record<string, unknown>, id: string): ModelRange {
  const min = num(v.min, 0, -1000, 1000)
  let max = num(v.max, 100, -1000, 1000)
  if (max <= min) max = min + 1
  const rest = Math.min(max, Math.max(min, num(v.rest, 0, -1000, 1000)))
  const rand = pair(v.rand) ? ((): [number, number] => { const [a, b] = v.rand as [number, number]; const lo = Math.min(a, b), hi = Math.max(a, b); return [Math.max(min, Math.min(max, lo)), Math.max(min, Math.min(max, hi))] })() : null
  return {
    id, name: text(v.name), scope: idOrNull(v.scope), min, rest, max, unit: v.unit === '°' || v.unit === '%' ? v.unit : '', show: v.show !== false, rand,
    drives: list(v.drives).map(drive).filter((d): d is ModelDrive => d !== null),
  }
}

function group(v: Record<string, unknown>, id: string): ModelGroup {
  const a = isRecord(v.attach) ? v.attach : null
  const shapeId = a ? idOf(a.shape) : null
  const kind = a && ['point', 'edge', 'range', 'inside'].includes(a.kind as string) ? (a.kind as 'point' | 'edge' | 'range' | 'inside') : 'point'
  return {
    id, name: text(v.name), parent: typeof v.parent === 'string' ? v.parent : null, objects: list(v.objects).filter((x): x is string => typeof x === 'string'),
    pivot: Array.isArray(v.pivot) && v.pivot.length === 2 ? [num(v.pivot[0], 100, -50, 250), num(v.pivot[1], 200, -50, 450)] : null,
    attach: a && shapeId ? { shape: shapeId, kind, i: Math.round(num(a.i, 0, 0, LIMITS.pointsMax - 1)), t: num(a.t, 0, 0, 1), slider: idOrNull(a.slider), rx: num(a.rx, 0.5, 0, 1), ry: num(a.ry, 0.5, 0, 1) } : null,
  }
}

function object(v: Record<string, unknown>, id: string): ModelObject {
  return { id, name: text(v.name), layer: v.layer === 'clothing' || v.layer === 'hair' ? v.layer : 'body', shapes: list(v.shapes).filter((x): x is string => typeof x === 'string') }
}

// What is wrong with one model in the file, or null.
function problem(v: unknown): string | null {
  if (!isRecord(v)) return 'is not a model'
  if (!text(v.name).trim()) return 'has no name'
  const tooMany = (n: number, max: number, what: string) => (n > max ? `has more than ${max} ${what}` : null)
  const shapes = list(v.shapes), objects = list(v.objects), groups = list(v.groups), ranges = list(v.ranges)
  const dup = (items: unknown[], what: string): string | null => {
    const ids = items.filter(isRecord).map(i => i.id)
    if (items.some(i => !isRecord(i) || !idOf(i.id))) return `has ${what} with an id that is not allowed`
    return new Set(ids).size !== ids.length ? `has two ${what} with the same id` : null
  }
  return tooMany(shapes.length, MOST.shapes, 'shapes') ?? tooMany(objects.length, MOST.objects, 'objects') ?? tooMany(groups.length, MOST.groups, 'groups') ?? tooMany(ranges.length, LIMITS.rangesMax, 'sliders')
    ?? dup(shapes, 'shapes') ?? dup(objects, 'objects') ?? dup(groups, 'groups') ?? dup(ranges, 'sliders')
    ?? shapes.map(s => tooMany(list((s as Record<string, unknown>).pts).length, LIMITS.pointsMax, 'points in a shape')).find(Boolean)
    ?? objects.map(o => tooMany(list((o as Record<string, unknown>).shapes).length, LIMITS.shapesPerObjectMax, 'shapes in an object')).find(Boolean)
    ?? groups.map(g => tooMany(list((g as Record<string, unknown>).objects).length, LIMITS.objectsPerGroupMax, 'objects in a group')).find(Boolean)
    ?? ranges.map(r => tooMany(list((r as Record<string, unknown>).drives).length, LIMITS.drivesMax, 'drives in a slider')).find(Boolean)
    ?? null
}

// Reads a file Export wrote. A model that cannot be used is skipped and said so; names and numbers are held to what the server accepts. Throws
// ModelFileError when the file as a whole cannot be read.
export function parseModelFile(source: string): ModelImport {
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch {
    throw new ModelFileError('This is not a Scriblr character model file. It is not valid JSON.')
  }
  if (!isRecord(data) || !(FILE_MARKER in data)) throw new ModelFileError('This is not a Scriblr character model file.')
  const version = data[FILE_MARKER]
  if (typeof version !== 'number' || version < 1) throw new ModelFileError('This is not a Scriblr character model file.')
  if (version > FILE_VERSION) throw new ModelFileError('This file was made by a newer version of Scriblr. Update Scriblr to import it.')
  if (!Array.isArray(data.models)) throw new ModelFileError('The file has no models in it.')

  const models: ModelContent[] = []
  const skipped: string[] = []
  data.models.forEach((raw, index) => {
    const why = problem(raw)
    if (why) { skipped.push(`The model at position ${index + 1} ${why}.`); return }
    const m = raw as Record<string, unknown>
    models.push(normalizeContent({
      ...blankContent(text(m.name)),
      description: text(m.description),
      shapes: list(m.shapes).map(s => shape(s as Record<string, unknown>, (s as Record<string, string>).id)),
      objects: list(m.objects).map(o => object(o as Record<string, unknown>, (o as Record<string, string>).id)),
      groups: list(m.groups).map(g => group(g as Record<string, unknown>, (g as Record<string, string>).id)),
      axis: num(m.axis, 100, 40, 160),
      ranges: list(m.ranges).map(r => range(r as Record<string, unknown>, (r as Record<string, string>).id)),
    }))
  })
  return { models, skipped }
}
