import type {
  ModelAxis, ModelBind, ModelBlend, ModelClass, ModelColour, ModelContent, ModelDrive, ModelForm, ModelGenre, ModelGradDir, ModelGradient, ModelGroup, ModelLook, ModelMove, ModelObject, ModelOverride, ModelPoint,
  ModelPreset, ModelRange, ModelShape, ModelSlot, ModelSwatch, ModelTint, ModelTintKind,
} from '../../../../api/types'
import { LIMITS } from './engine/limits'
import { KIND_MAX, SWATCH_NAME_MAX, TINT_RANGE, TONE_RANGE, blankContent, normalizeContent, repairLooks } from './modelContent'

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

// A point link the server would accept (it needs the shape it follows), or null.
function bind(v: unknown): ModelBind | null {
  if (!isRecord(v)) return null
  const s = idOf(v.s)
  if (!s) return null
  const at = (x: unknown) => Math.round(num(x, 0, 0, LIMITS.pointsMax - 1))
  return { kind: v.kind === 'edge' ? 'edge' : 'point', s, i: at(v.i), d: pair(v.d) ?? [0, 0], e: at(v.e), t: num(v.t, 0, 0, 1), o: num(v.o, 0, -100, 100) }
}

function point(v: unknown): ModelPoint {
  const p = isRecord(v) ? v : {}
  const out: ModelPoint = { x: num(p.x, 0, -50, 250), y: num(p.y, 0, -50, 450), m: (MODES.includes(p.m as string) ? p.m : 'c') as ModelPoint['m'], hi: pair(p.hi), ho: pair(p.ho) }
  if (typeof p.w === 'number') out.w = num(p.w, 0, 0, 1)
  const b = bind(p.bind)
  if (b) out.bind = b
  return out
}

// The paint effects of a shape (phase 4b), held to what the server accepts.
function tint(v: unknown): ModelTint | null {
  if (!isRecord(v)) return null
  const kind = (['shadow', 'mid', 'highlight'].includes(v.kind as string) ? v.kind : 'shadow') as ModelTintKind
  return { kind, t: Math.round(num(v.t, 0.12, TINT_RANGE.min, TINT_RANGE.max) * 100) / 100 }
}
function gradient(v: unknown): ModelGradient | null {
  if (!isRecord(v)) return null
  return { dir: (['down', 'up', 'left', 'right', 'radial'].includes(v.dir as string) ? v.dir : 'down') as ModelGradDir, to: idOrNull(v.to) }
}
function look(v: Record<string, unknown>): ModelLook | null {
  const shapeId = idOf(v.shape)
  if (!shapeId) return null
  return { shape: shapeId, slot: idOrNull(v.slot), gray: typeof v.gray === 'number' ? Math.round(num(v.gray, 50, 0, 100)) : null, tone: typeof v.tone === 'number' ? Math.round(num(v.tone, 0, TONE_RANGE.min, TONE_RANGE.max)) : null }
}

function shape(v: Record<string, unknown>, id: string): ModelShape {
  const view = v.view === 'front' || v.view === 'back' ? v.view : 'both'
  return {
    id, name: text(v.name), closed: v.closed !== false, z: num(v.z, 40, 0, 100), op: num(v.op, 1, 0, 1), view, pts: list(v.pts).map(point),
    half: Math.round(num(v.half, 0, 0, LIMITS.pointsMax)), template: idOrNull(v.template),
    mirrorOf: idOrNull(v.mirrorOf), back: Array.isArray(v.back) ? v.back.map(point) : null, zBack: typeof v.zBack === 'number' ? num(v.zBack, 40, 0, 100) : null,
    loose: idOrNull(v.loose), copyOf: idOrNull(v.copyOf), hide: v.hide === true, slot: idOrNull(v.slot), gray: typeof v.gray === 'number' ? Math.round(num(v.gray, 50, 0, 100)) : null,
    tone: typeof v.tone === 'number' ? Math.round(num(v.tone, 0, TONE_RANGE.min, TONE_RANGE.max)) : 0, derive: tint(v.derive), shade: tint(v.shade), grad: gradient(v.grad),
    blend: (['multiply', 'screen', 'overlay'].includes(v.blend as string) ? v.blend : null) as ModelBlend | null, clip: idOrNull(v.clip),
    cut: [...new Set(list(v.cut).map(idOf).filter((x): x is string => x !== null))].slice(0, LIMITS.cutsMax), helper: v.helper === true,
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
    id, name: text(v.name), parent: typeof v.parent === 'string' ? v.parent : null, objects: list(v.objects).filter((x): x is string => typeof x === 'string'), mirrorOf: idOrNull(v.mirrorOf),
    pivot: Array.isArray(v.pivot) && v.pivot.length === 2 ? [num(v.pivot[0], 100, -50, 250), num(v.pivot[1], 200, -50, 450)] : null,
    attach: a && shapeId ? { shape: shapeId, kind, i: Math.round(num(a.i, 0, 0, LIMITS.pointsMax - 1)), t: num(a.t, 0, 0, 1), slider: idOrNull(a.slider), rx: num(a.rx, 0.5, 0, 1), ry: num(a.ry, 0.5, 0, 1) } : null,
  }
}

// The entries of a list that have an id the server accepts, the first of each id (the server drops the others or refuses the model).
function withIds<T>(items: unknown[], read: (v: Record<string, unknown>, id: string) => T | null): T[] {
  const seen = new Set<string>(), out: T[] = []
  for (const item of items) {
    if (!isRecord(item)) continue
    const id = idOf(item.id)
    if (!id || seen.has(id)) continue
    const made = read(item, id)
    if (made) { seen.add(id); out.push(made) }
  }
  return out
}

function override(v: Record<string, unknown>): ModelOverride | null {
  const shapeId = idOf(v.shape)
  return shapeId ? { shape: shapeId, pts: list(v.pts).map(point) } : null
}

function form(v: Record<string, unknown>, id: string): ModelForm {
  const seen = new Set<string>()
  const ovr = list(v.ovr).filter(isRecord).map(override).filter((o): o is ModelOverride => o !== null && !seen.has(o.shape) && !!seen.add(o.shape))
  return { id, name: text(v.name), ovr, looks: repairLooks(list(v.looks).filter(isRecord).map(look).filter((l): l is ModelLook => l !== null)) }
}

// An axis needs a form; its default form is one of its forms.
function axis(v: Record<string, unknown>, id: string): ModelAxis | null {
  const options = withIds(list(v.options), form)
  if (options.length === 0) return null
  const initial = typeof v.initial === 'string' && options.some(o => o.id === v.initial) ? v.initial : options[0].id
  return { id, name: text(v.name), options, initial }
}

function object(v: Record<string, unknown>, id: string): ModelObject {
  return {
    id, name: text(v.name), layer: v.layer === 'clothing' || v.layer === 'hair' ? v.layer : 'body', shapes: list(v.shapes).filter((x): x is string => typeof x === 'string'),
    mirrorOf: idOrNull(v.mirrorOf), classOf: idOrNull(v.classOf), axes: withIds(list(v.axes), axis),
  }
}

function preset(v: Record<string, unknown>, id: string): ModelPreset {
  const values: Record<string, number> = {}
  if (isRecord(v.values)) for (const [k, x] of Object.entries(v.values)) if (ID.test(k) && typeof x === 'number' && Number.isFinite(x)) values[k] = num(x, 0, -1000, 1000)
  const forms: Record<string, string> = {}
  if (isRecord(v.forms)) for (const [k, x] of Object.entries(v.forms)) if (k.length >= 3 && k.length <= 170 && idOf(x) && Object.keys(forms).length < LIMITS.presetFormsMax) forms[k] = x as string
  const hidden = [...new Set(list(v.hidden).map(idOf).filter((x): x is string => x !== null))].slice(0, 100)
  return { id, name: text(v.name), kind: text(v.kind).trim().slice(0, KIND_MAX) || 'Pose', values, hidden, scope: idOrNull(v.scope), forms }
}

function modelClass(v: Record<string, unknown>, id: string): ModelClass | null {
  const template = idOf(v.template)
  return template ? { id, name: text(v.name), template, exclusive: v.exclusive === true } : null
}

const colourOf = (v: Record<string, unknown>, id: string): ModelColour => ({
  id, name: text(v.name), hex: typeof v.hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.hex) ? v.hex.toLowerCase() : '#808080',
  genres: [...new Set(list(v.genres).map(idOf).filter((x): x is string => x !== null))].slice(0, LIMITS.genresMax),
})

function slot(v: Record<string, unknown>, id: string): ModelSlot {
  const pct = (x: unknown, fallback: number) => Math.round(num(x, fallback, 0, 100))
  return {
    id, name: text(v.name), lMin: pct(v.lMin, 50), lRest: pct(v.lRest, 50), lMax: pct(v.lMax, 50), aMin: pct(v.aMin, 100), aRest: pct(v.aRest, 100), aMax: pct(v.aMax, 100),
    colours: withIds(list(v.colours), colourOf),
  }
}

const genre = (v: Record<string, unknown>, id: string): ModelGenre => ({ id, name: text(v.name).trim().slice(0, SWATCH_NAME_MAX) })
const swatch = (v: Record<string, unknown>, id: string): ModelSwatch => ({ id, name: text(v.name).trim().slice(0, SWATCH_NAME_MAX), h: Math.round(num(v.h, 0, 0, 359)), s: Math.round(num(v.s, 50, 0, 100)) })

// What is wrong with one model in the file, or null.
function problem(v: unknown): string | null {
  if (!isRecord(v)) return 'is not a model'
  if (!text(v.name).trim()) return 'has no name'
  const tooMany = (n: number, max: number, what: string) => (n > max ? `has more than ${max} ${what}` : null)
  const shapes = list(v.shapes), objects = list(v.objects), groups = list(v.groups), ranges = list(v.ranges)
  const rec = (x: unknown): Record<string, unknown> => (isRecord(x) ? x : {})
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
    ?? tooMany(list(v.presets).length, LIMITS.presetsMax, 'presets') ?? tooMany(list(v.classes).length, LIMITS.classesMax, 'classes')
    ?? tooMany(list(v.slots).length, LIMITS.slotsMax, 'colour slots') ?? tooMany(list(v.genres).length, LIMITS.genresMax, 'genres') ?? tooMany(list(v.palette).length, LIMITS.paletteMax, 'swatches in the palette')
    ?? list(v.slots).map(sl => tooMany(list(rec(sl).colours).length, LIMITS.coloursMax, 'default colours in a slot')).find(Boolean)
    ?? objects.map(o => tooMany(list(rec(o).axes).length, LIMITS.axesMax, 'axes of forms in an object')).find(Boolean)
    ?? objects.map(o => list(rec(o).axes).map(a => tooMany(list(rec(a).options).length, LIMITS.formsMax, 'forms in an axis')).find(Boolean)).find(Boolean)
    ?? shapes.map(sh => (Array.isArray(rec(sh).back) ? tooMany(list(rec(sh).back).length, LIMITS.pointsMax, 'points in an outline for the back') : null)).find(Boolean)
    ?? objects.map(o => list(rec(o).axes).map(a => list(rec(a).options).map(f => list(rec(f).ovr).map(ov => tooMany(list(rec(ov).pts).length, LIMITS.pointsMax, 'points in the outline of a form')).find(Boolean)).find(Boolean)).find(Boolean)).find(Boolean)
    ?? objects.map(o => list(rec(o).axes).map(a => list(rec(a).options).map(f => tooMany(list(rec(f).looks).length, LIMITS.looksMax, 'paint changes in a form')).find(Boolean)).find(Boolean)).find(Boolean)
    ?? shapes.map(sh => tooMany(list(rec(sh).cut).length, LIMITS.cutsMax, 'cut-outs in a shape')).find(Boolean)
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
      presets: withIds(list(m.presets), preset),
      classes: withIds(list(m.classes), modelClass),
      genres: withIds(list(m.genres), genre),
      palette: withIds(list(m.palette), swatch),
      slots: withIds(list(m.slots), slot),
    }))
  })
  return { models, skipped }
}
