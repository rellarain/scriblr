import type { ModelGrip, ModelBone, ModelContent, ModelEntry, ModelFade, ModelFallSide, ModelFit, ModelForm, ModelFrame, ModelGradient, ModelGroup, ModelHsl, ModelLayer, ModelLook, ModelObject, ModelPreset, ModelRange, ModelShape, ModelSlot, ModelTint } from '../../../../api/types'
import { LIMITS, copyBytes, linkCount, shadingCount } from './engine/limits'
import { chainOf } from './engine/rig'
import { standardGenres, standardSlots, starterPalette } from './engine/standardColours'

// The pure side of the Characters page: editing a model's tree (groups, objects, shapes), the checks Publish makes, and ids and names. Nothing here
// touches the network or React. Every function returns new content and leaves the one it was given alone.

export const NAME_MAX = 60
export const DESCRIPTION_MAX = 400
export const HISTORY_MAX = 10
export const LAYERS: Array<{ id: ModelLayer; name: string }> = [{ id: 'body', name: 'Body' }, { id: 'clothing', name: 'Clothing' }, { id: 'hair', name: 'Hair' }]

export type MakeId = (prefix: string) => string
export const randomId: MakeId = prefix => `${prefix}_${Math.random().toString(36).slice(2, 10)}`

export const RANGE_NAME_MAX = 40
export const KIND_MAX = 24
export const SWATCH_NAME_MAX = 30
export const AXIS_RANGE = { min: 40, max: 160 } as const
// frames (phase 5a): the smallest and biggest a frame is, and the card colour a figure stands on unless the model says another
export const FRAME_MIN = 8
export const FRAME_BIGGEST = 500
export const TILE_DEFAULT = '#e6d6c3'

export const blankContent = (name = ''): ModelContent => ({ name, description: '', shapes: [], objects: [], groups: [], axis: 100, ranges: [] })
// What a new model starts as: blank, with the standard genres, starter palette and colour slots (all of it plain data an admin may change or delete).
export const starterContent = (name = ''): ModelContent => ({ ...blankContent(name), genres: standardGenres(), palette: starterPalette(), slots: standardSlots() })

// A group as the page makes one: no parent, no pivot and no anchor until the rig says otherwise.
export const newGroup = (id: string, name: string, parent: string | null = null, objects: string[] = []): ModelGroup => ({ id, name, parent, objects, pivot: null, attach: null })

const clean = (v: string, max: number): string => v.trim().slice(0, max)

// What a save sends: names trimmed and cut to length, the way the server cleans them (the page keeps what was typed until then).
export function normalizeContent(c: ModelContent): ModelContent {
  return {
    ...c,
    name: clean(c.name, NAME_MAX),
    description: clean(c.description, DESCRIPTION_MAX),
    shapes: c.shapes.map(s => ({ ...s, name: clean(s.name, NAME_MAX), mirrorOf: s.mirrorOf ?? null, back: s.back ?? null, zBack: s.zBack ?? null, loose: s.loose ?? null, copyOf: s.copyOf ?? null, hide: s.hide === true, slot: s.slot ?? null, gray: s.gray ?? null, ...paintFields(s) })),
    objects: c.objects.map(o => ({ ...o, name: clean(o.name, NAME_MAX), mirrorOf: o.mirrorOf ?? null, classOf: o.classOf ?? null, ...fitFields(o), hsl: repairHsl(o.hsl), axes: (o.axes ?? []).map(a => ({ ...a, name: clean(a.name, NAME_MAX), options: a.options.map(f => ({ ...f, name: clean(f.name, NAME_MAX), looks: repairLooks(f.looks) })) })) })),
    groups: c.groups.map(g => ({ ...g, name: clean(g.name, NAME_MAX), pivot: g.pivot ?? null, attach: g.attach ?? null, mirrorOf: g.mirrorOf ?? null })),
    axis: c.axis ?? 100,
    ranges: (c.ranges ?? []).map(repairRange),
    presets: (c.presets ?? []).map(p => ({ ...p, name: clean(p.name, NAME_MAX), kind: clean(p.kind, KIND_MAX) || 'Pose', scope: p.scope ?? null, forms: p.forms ?? {}, fall: p.fall && FALL_SIDES.includes(p.fall) ? p.fall : null, grip: p.grip ?? null, ...variantFields(p) })),
    classes: (c.classes ?? []).map(k => ({ ...k, name: clean(k.name, NAME_MAX), exclusive: k.exclusive === true })),
    genres: (c.genres ?? []).map(g => ({ ...g, name: clean(g.name, SWATCH_NAME_MAX) })),
    palette: (c.palette ?? []).map(p => ({ ...p, name: clean(p.name, SWATCH_NAME_MAX), h: percent(p.h, 0, 359), s: percent(p.s, 50, 100) })),
    slots: (c.slots ?? []).map(repairSlot),
    bones: (c.bones ?? []).map(repairBone),
    headBone: c.headBone ?? null,
    frames: (c.frames ?? []).map(repairFrame),
    tile: typeof c.tile === 'string' && HEX.test(c.tile) ? c.tile.toLowerCase() : TILE_DEFAULT,
    grips: (c.grips ?? []).map(repairGrip),
  }
}

// The paint effects of a shape as the server keeps them (phase 4b): a tone held to -2..2, amounts to 0.02..0.8 in hundredths, only the real kinds, no repeated or
// excess cut-outs.
export const TINT_RANGE = { min: 0.02, max: 0.8 } as const
export const TONE_RANGE = { min: -2, max: 2 } as const
const KINDS = ['shadow', 'mid', 'highlight'], DIRS = ['down', 'up', 'left', 'right', 'radial'], BLENDS = ['multiply', 'screen', 'overlay']
export const tintAmount = (t: number): number => Math.round(Math.min(TINT_RANGE.max, Math.max(TINT_RANGE.min, Number.isFinite(t) ? t : 0.12)) * 100) / 100
const tintOf = (t: ModelTint | null | undefined): ModelTint | null => (t ? { kind: KINDS.includes(t.kind) ? t.kind : 'shadow', t: tintAmount(t.t) } : null)
const gradOf = (g: ModelGradient | null | undefined): ModelGradient | null => (g ? { dir: DIRS.includes(g.dir) ? g.dir : 'down', to: g.to ?? null } : null)
function paintFields(s: ModelShape) {
  return {
    tone: typeof s.tone === 'number' && Number.isFinite(s.tone) ? Math.round(Math.min(TONE_RANGE.max, Math.max(TONE_RANGE.min, s.tone))) : 0,
    derive: tintOf(s.derive), shade: tintOf(s.shade), grad: gradOf(s.grad), blend: s.blend && BLENDS.includes(s.blend) ? s.blend : null, clip: s.clip ?? null,
    cut: [...new Set(s.cut ?? [])].slice(0, LIMITS.cutsMax), helper: s.helper === true, opBy: fadeOf(s.opBy),
  }
}
// The sides things may fall to, and a shape's fade as the server keeps it (phase 5b): the places are held to the span a slider may have.
// A grip point as the server keeps it (phase 5c): the name cut, the place inside the model's space, the angle held to a half turn each way.
export const ROLE_MAX = 40
function repairGrip(g: ModelGrip): ModelGrip {
  return { id: g.id, name: clean(g.name, RANGE_NAME_MAX), group: g.group ?? null, x: unit(g.x, -50, 250, 100), y: unit(g.y, -50, 450, 200), angle: unit(g.angle, -180, 180, 0) }
}
export const FALL_SIDES: ModelFallSide[] = ['down', 'left', 'right', 'behind']
const fadeAt = (v: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1000, Math.max(-1000, v)) : fallback)
const fadeOf = (f: ModelFade | null | undefined): ModelFade | null => (f && typeof f.slider === 'string' && f.slider ? { slider: f.slider, hidden: fadeAt(f.hidden, 0), shown: fadeAt(f.shown, 100) } : null)
// A form's looks as the server keeps them: a slot wins over a gray, one look per shape, a look that changes nothing is dropped.
export function repairLooks(looks: ModelLook[] | undefined): ModelLook[] {
  const seen = new Set<string>(), out: ModelLook[] = []
  for (const l of looks ?? []) {
    const slot = l.slot ?? null, gray = slot === null && l.gray != null ? Math.round(Math.min(100, Math.max(0, l.gray))) : null
    const tone = l.tone == null ? null : Math.round(Math.min(TONE_RANGE.max, Math.max(TONE_RANGE.min, l.tone)))
    if ((slot === null && gray === null && tone === null) || seen.has(l.shape)) continue
    seen.add(l.shape)
    out.push({ shape: l.shape, slot, gray, tone })
  }
  return out
}

// The parts of a colour an object or a style holds, as the server keeps them (phase D3a): hue held to 0..359, saturation and lightness to 0..100, a part that is not
// a number free (null), and an entry that locks nothing dropped.
const part = (v: number | null | undefined, top: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(top, Math.max(0, v))) : null)
export function repairHsl(locks: Record<string, ModelHsl> | undefined): Record<string, ModelHsl> {
  const out: Record<string, ModelHsl> = {}
  for (const [slot, l] of Object.entries(locks ?? {})) {
    const lock = { h: part(l?.h, 359), s: part(l?.s, 100), l: part(l?.l, 100) }
    if (lock.h !== null || lock.s !== null || lock.l !== null) out[slot] = lock
  }
  return out
}
// What a variant bundles and a style adds, with the defaults the server fills in.
function variantFields(p: ModelPreset): Pick<ModelPreset, 'styles' | 'picks' | 'hsl' | 'order'> {
  return { styles: p.styles ?? {}, picks: p.picks ?? {}, hsl: repairHsl(p.hsl), order: [...new Set(p.order ?? [])] }
}

// A slider as the server keeps it (phase 5a: the writer's limit is held inside the slider, ordered, holds the resting value; the whole slider is no limit).
function repairRange(r: ModelRange): ModelRange {
  const { drives, role: _role, ...rest } = r
  let limit: [number, number] | null = null
  if (Array.isArray(r.limit) && r.limit.length === 2) {
    const held = (v: number) => Math.min(r.max, Math.max(r.min, Number.isFinite(v) ? v : r.rest))
    const [a, b] = [held(r.limit[0]), held(r.limit[1])]
    const lo = Math.min(a, b, r.rest), hi = Math.max(a, b, r.rest)
    limit = lo <= r.min && hi >= r.max ? null : [lo, hi]
  }
  const role = typeof r.role === 'string' ? r.role.trim().slice(0, ROLE_MAX) : ''
  return { ...rest, name: clean(r.name, RANGE_NAME_MAX), limit, role: role || null, drives }
}
// How an object fits the body: only a stretching object has a shape to follow.
function fitFields(o: ModelObject): { fit: ModelFit; fitTo: string | null } {
  const fit: ModelFit = o.fit === 'keep' || o.fit === 'stretch' ? o.fit : 'scale'
  return { fit, fitTo: fit === 'stretch' ? o.fitTo ?? null : null }
}
const unit = (v: number, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback)
function repairBone(b: ModelBone): ModelBone {
  return { id: b.id, name: clean(b.name, RANGE_NAME_MAX), start: b.start, end: { kind: b.end.kind === 'point' ? 'point' : 'group', id: b.end.id, i: Math.round(unit(b.end.i, 0, LIMITS.pointsMax - 1, 0)) } }
}
function repairFrame(f: ModelFrame): ModelFrame {
  return {
    id: f.id, name: clean(f.name, RANGE_NAME_MAX), x: unit(f.x, -50, 250, 0), y: unit(f.y, -50, 450, 0), w: unit(f.w, FRAME_MIN, FRAME_BIGGEST, 100), h: unit(f.h, FRAME_MIN, FRAME_BIGGEST, 100),
    hide: [...new Set(f.hide ?? [])].slice(0, LIMITS.frameHideMax),
  }
}

const percent = (v: number, fallback: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(0, v))) : fallback)
const HEX = /^#[0-9a-fA-F]{6}$/

// A slot as the server keeps it: names cut, ranges whole numbers with the smallest first and the resting value between, repeated default colours dropped.
function repairSlot(sl: ModelSlot): ModelSlot {
  const lMin = percent(sl.lMin, 50, 100), lMax = Math.max(percent(sl.lMax, 50, 100), lMin), aMin = percent(sl.aMin, 100, 100), aMax = Math.max(percent(sl.aMax, 100, 100), aMin)
  const seen = new Set<string>()
  return {
    ...sl, name: clean(sl.name, NAME_MAX), lMin, lMax, lRest: Math.min(lMax, Math.max(lMin, percent(sl.lRest, 50, 100))), aMin, aMax, aRest: Math.min(aMax, Math.max(aMin, percent(sl.aRest, 100, 100))),
    colours: sl.colours.filter(k => !(seen.has(k.id) || !seen.add(k.id))).map(k => ({ ...k, name: clean(k.name, NAME_MAX), hex: HEX.test(k.hex) ? k.hex.toLowerCase() : '#808080', genres: [...new Set(k.genres)].slice(0, LIMITS.genresMax) })),
  }
}

// `name`, or `name (copy)`, `name (copy 2)` ... when it is taken (compared without case), kept within the name limit.
export function copyName(name: string, entries: Array<{ draft: { name: string } }>): string {
  const taken = new Set(entries.map(e => e.draft.name.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? ' (copy)' : ` (copy ${n})`
    const candidate = name.slice(0, NAME_MAX - suffix.length).trimEnd() + suffix
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

// The list with the item `id` moved to just before `beforeId` (or to the end for null).
export function moveBefore<T extends { id: string }>(list: T[], id: string, beforeId: string | null): T[] {
  const item = list.find(x => x.id === id)
  if (!item || id === beforeId) return list
  const rest = list.filter(x => x.id !== id)
  const at = beforeId === null ? rest.length : rest.findIndex(x => x.id === beforeId)
  return at < 0 ? list : [...rest.slice(0, at), item, ...rest.slice(at)]
}

// ---- reading ----

export const shapeById = (c: ModelContent, id: string): ModelShape | undefined => c.shapes.find(s => s.id === id)
export const objectById = (c: ModelContent, id: string): ModelObject | undefined => c.objects.find(o => o.id === id)
export const groupById = (c: ModelContent, id: string): ModelGroup | undefined => c.groups.find(g => g.id === id)
export const objectOfShape = (c: ModelContent, shapeId: string): ModelObject | undefined => c.objects.find(o => o.shapes.includes(shapeId))
export const groupOfObject = (c: ModelContent, objectId: string): ModelGroup | undefined => c.groups.find(g => g.objects.includes(objectId))

// The tree the page shows: the three layers, each with the groups that have an object on it, each group's objects of that layer, each object's shapes.
export interface TreeShape { shape: ModelShape }
export interface TreeObject { object: ModelObject; shapes: ModelShape[] }
export interface TreeGroup { group: ModelGroup; objects: TreeObject[] }
export interface TreeLayer { id: ModelLayer; name: string; groups: TreeGroup[]; loose: TreeObject[] }
export function treeOf(c: ModelContent): TreeLayer[] {
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  const asTree = (o: ModelObject): TreeObject => ({ object: o, shapes: o.shapes.map(id => shapes.get(id)).filter((s): s is ModelShape => !!s) })
  return LAYERS.map(layer => {
    const groups: TreeGroup[] = []
    for (const g of c.groups) {
      const objs = g.objects.map(id => c.objects.find(o => o.id === id)).filter((o): o is ModelObject => !!o && o.layer === layer.id)
      if (objs.length) groups.push({ group: g, objects: objs.map(asTree) })
    }
    // objects that are in no group yet (a new object is added to a group; these are only from an unfinished draft)
    const loose = c.objects.filter(o => o.layer === layer.id && !c.groups.some(g => g.objects.includes(o.id))).map(asTree)
    return { id: layer.id, name: layer.name, groups, loose }
  })
}

// ---- editing ----

export function updateShape(c: ModelContent, id: string, change: (s: ModelShape) => ModelShape): ModelContent {
  return { ...c, shapes: c.shapes.map(s => (s.id === id ? change(s) : s)) }
}

export function addGroup(c: ModelContent, group: ModelGroup): ModelContent {
  return { ...c, groups: [...c.groups, group] }
}

// A new object in a group (the group lists it), on a layer.
export function addObject(c: ModelContent, groupId: string, object: ModelObject): ModelContent {
  return { ...c, objects: [...c.objects, object], groups: c.groups.map(g => (g.id === groupId ? { ...g, objects: [...g.objects, object.id] } : g)) }
}

// A new shape in an object (the object lists it).
export function addShape(c: ModelContent, objectId: string, shape: ModelShape, afterId?: string): ModelContent {
  return {
    ...c,
    shapes: [...c.shapes, shape],
    objects: c.objects.map(o => {
      if (o.id !== objectId) return o
      const at = afterId ? o.shapes.indexOf(afterId) : -1
      return { ...o, shapes: at >= 0 ? [...o.shapes.slice(0, at + 1), shape.id, ...o.shapes.slice(at + 1)] : [...o.shapes, shape.id] }
    }),
  }
}

// What goes when these shapes, objects and groups go: their twins too (a twin is nothing without its original), and a group's objects and an object's
// shapes with it. Repeats until nothing more is added.
export function goneWith(c: ModelContent, seed: { shapes?: string[]; objects?: string[]; groups?: string[] }) {
  const shapes = new Set(seed.shapes ?? []), objects = new Set(seed.objects ?? []), groups = new Set(seed.groups ?? [])
  for (let grew = true; grew;) {
    const before = shapes.size + objects.size + groups.size
    for (const g of c.groups) if (g.mirrorOf && groups.has(g.mirrorOf)) groups.add(g.id)
    for (const o of c.objects) if (o.mirrorOf && objects.has(o.mirrorOf)) objects.add(o.id)
    for (const s of c.shapes) if (s.mirrorOf && shapes.has(s.mirrorOf)) shapes.add(s.id)
    for (const s of c.shapes) if (s.copyOf && shapes.has(s.copyOf)) shapes.add(s.id)
    for (const g of c.groups) if (groups.has(g.id)) for (const oid of g.objects) objects.add(oid)
    for (const o of c.objects) if (objects.has(o.id)) for (const sid of o.shapes) shapes.add(sid)
    grew = shapes.size + objects.size + groups.size > before
  }
  return { shapes, objects, groups }
}

// A form without the outlines and paint changes of shapes that are gone.
function forgetShapes(f: ModelForm, gone: Set<string>): ModelForm {
  const ovr = f.ovr.some(v => gone.has(v.shape)) ? f.ovr.filter(v => !gone.has(v.shape)) : f.ovr
  const looks = (f.looks ?? []).some(l => gone.has(l.shape)) ? (f.looks ?? []).filter(l => !gone.has(l.shape)) : f.looks
  return ovr === f.ovr && looks === f.looks ? f : { ...f, ovr, ...(looks ? { looks } : {}) }
}

// The presets that are left once things are gone: a style goes with its scope, a variant forgets the styles that went and the objects they were for, and no preset
// keeps a form, a hidden thing or a shape of something gone.
function forgetPresets(c: ModelContent, gone: { shapes: Set<string>; objects: Set<string>; groups: Set<string> }, deadClasses: Set<string>): ModelPreset[] {
  const all = c.presets ?? []
  const kept = all.filter(p => !(p.scope && (gone.objects.has(p.scope) || gone.groups.has(p.scope))))
  const deadStyles = new Set(all.filter(p => !kept.includes(p)).map(p => p.id))
  return kept.map(p => {
    const forms = p.forms ?? {}
    const keep = Object.keys(forms).filter(k => !k.startsWith('class:') ? ![...gone.objects].some(o => k.startsWith(`${o}.`)) : !deadClasses.has(k.slice(6)) && !gone.objects.has(forms[k]))
    let out: ModelPreset = keep.length === Object.keys(forms).length ? p : { ...p, forms: Object.fromEntries(keep.map(k => [k, forms[k]])) }
    const goneThing = (h: string) => gone.objects.has(h) || gone.groups.has(h) || gone.shapes.has(h)
    if (out.hidden.some(goneThing)) out = { ...out, hidden: out.hidden.filter(h => !goneThing(h)) }
    const styles = Object.entries(out.styles ?? {})
    if (styles.some(([o, st]) => gone.objects.has(o) || deadStyles.has(st))) out = { ...out, styles: Object.fromEntries(styles.filter(([o, st]) => !gone.objects.has(o) && !deadStyles.has(st))) }
    if ((out.order ?? []).some(id => gone.shapes.has(id))) out = { ...out, order: (out.order ?? []).filter(id => !gone.shapes.has(id)) }
    return out
  })
}

function removeAll(c: ModelContent, gone: { shapes: Set<string>; objects: Set<string>; groups: Set<string> }): ModelContent {
  const parentOf = new Map(c.groups.map(g => [g.id, g.parent]))
  // a class goes with its template; its members stop being members (the page freezes them first, so they keep their look: see classEdit.detachBeforeRemoval)
  const deadClasses = new Set((c.classes ?? []).filter(k => gone.objects.has(k.template)).map(k => k.id))
  const up = (id: string | null): string | null => { let cur = id; while (cur !== null && gone.groups.has(cur)) cur = parentOf.get(cur) ?? null; return cur }
  return {
    ...c,
    shapes: c.shapes.filter(s => !gone.shapes.has(s.id)).map(s => {
      let out = s
      if (s.pts.some(p => p.bind && gone.shapes.has(p.bind.s))) out = { ...out, pts: s.pts.map(p => (p.bind && gone.shapes.has(p.bind.s) ? { ...p, bind: null } : p)) }
      // a clip or a cut-out that pointed at a shape that is gone no longer does
      if (s.clip && gone.shapes.has(s.clip)) out = { ...out, clip: null }
      if ((s.cut ?? []).some(t => gone.shapes.has(t))) out = { ...out, cut: (s.cut ?? []).filter(t => !gone.shapes.has(t)) }
      return out
    }),
    objects: c.objects.filter(o => !gone.objects.has(o.id)).map(o => ({
      ...o, shapes: o.shapes.filter(sid => !gone.shapes.has(sid)), classOf: o.classOf && deadClasses.has(o.classOf) ? null : o.classOf,
      ...(o.fitTo && gone.shapes.has(o.fitTo) ? { fit: 'scale' as const, fitTo: null } : {}),
      axes: (o.axes ?? []).map(a => ({ ...a, options: a.options.map(f => forgetShapes(f, gone.shapes)) })),
    })),
    groups: c.groups.filter(g => !gone.groups.has(g.id)).map(g => ({ ...g, parent: up(g.parent), objects: g.objects.filter(oid => !gone.objects.has(oid)) })),
    presets: forgetPresets(c, gone, deadClasses),
    classes: (c.classes ?? []).filter(k => !deadClasses.has(k.id)),
    ...(c.grips ? { grips: c.grips.filter(g => !(g.group && gone.groups.has(g.group))) } : {}),
    ...(c.frames ? { frames: c.frames.map(f => (f.hide.some(h => gone.objects.has(h) || gone.groups.has(h)) ? { ...f, hide: f.hide.filter(h => !gone.objects.has(h) && !gone.groups.has(h)) } : f)) } : {}),
  }
}

// A shape goes with its twin.
export function removeShape(c: ModelContent, id: string): ModelContent {
  return removeAll(c, goneWith(c, { shapes: [id] }))
}

// An object goes with its shapes, and with its twin.
export function removeObject(c: ModelContent, id: string): ModelContent {
  return removeAll(c, goneWith(c, { objects: [id] }))
}

// A group goes with its objects and their shapes, and with its twin; a group under it moves up to its parent.
export function removeGroup(c: ModelContent, id: string): ModelContent {
  if (!groupById(c, id)) return c
  return removeAll(c, goneWith(c, { groups: [id] }))
}

// The twins of a shape, object or group (those that mirror it).
export const twinsOf = (c: ModelContent, kind: 'shape' | 'object' | 'group', id: string): string[] =>
  (kind === 'shape' ? c.shapes : kind === 'object' ? c.objects : c.groups).filter(x => x.mirrorOf === id).map(x => x.id)

// How many points a shape's outline has: a twin has as many as the shape it mirrors.
export function outlineSize(c: ModelContent, s: ModelShape): number {
  const src = s.mirrorOf ? shapeById(c, s.mirrorOf) : undefined
  if (src && !src.mirrorOf) return src.pts.length
  // a shape of a class member with no points of its own follows the template's shape
  const tpl = s.copyOf && s.pts.length === 0 ? shapeById(c, s.copyOf) : undefined
  return tpl && !tpl.copyOf ? tpl.pts.length : s.pts.length
}

export const renameShape = (c: ModelContent, id: string, name: string): ModelContent => updateShape(c, id, s => ({ ...s, name }))
export const renameObject = (c: ModelContent, id: string, name: string): ModelContent => ({ ...c, objects: c.objects.map(o => (o.id === id ? { ...o, name } : o)) })
export const renameGroup = (c: ModelContent, id: string, name: string): ModelContent => ({ ...c, groups: c.groups.map(g => (g.id === id ? { ...g, name } : g)) })

// A copy of a shape right after the original, in the same object.
export function duplicateShape(c: ModelContent, id: string, newId: string): ModelContent {
  const src = shapeById(c, id), owner = objectOfShape(c, id)
  if (!src || !owner) return c
  if (src.mirrorOf) return c   // a twin has no outline to copy: break the pair first
  const copy: ModelShape = { ...src, id: newId, name: src.name ? `${src.name} (copy)`.slice(0, NAME_MAX) : '', pts: src.pts.map(p => ({ ...p })), back: src.back ? src.back.map(p => ({ ...p })) : src.back }
  return addShape(c, owner.id, copy, id)
}

// A shape moves up or down among the shapes of its object (the later in the list, the higher it is drawn).
export function moveShapeWithin(c: ModelContent, objectId: string, shapeId: string, beforeId: string | null): ModelContent {
  return { ...c, objects: c.objects.map(o => (o.id === objectId ? { ...o, shapes: moveBefore(o.shapes.map(id => ({ id })), shapeId, beforeId).map(x => x.id) } : o)) }
}

// An object moves among the objects of its group (the later in the list, the nearer the front).
export function moveObjectWithin(c: ModelContent, groupId: string, objectId: string, beforeId: string | null): ModelContent {
  return { ...c, groups: c.groups.map(g => (g.id === groupId ? { ...g, objects: moveBefore(g.objects.map(id => ({ id })), objectId, beforeId).map(x => x.id) } : g)) }
}

// The next free id of a kind ('s', 'o', 'g', 'r', 'b' for a bone, 'f' for a frame) in the content.
export function freshId(c: ModelContent, prefix: 's' | 'o' | 'g' | 'r' | 'b' | 'f' | 'k', make: MakeId = randomId): string {
  const taken = new Set([...c.shapes.map(s => s.id), ...c.objects.map(o => o.id), ...c.groups.map(g => g.id), ...c.ranges.map(r => r.id), ...(c.bones ?? []).map(b => b.id), ...(c.frames ?? []).map(f => f.id), ...(c.grips ?? []).map(k => k.id)])
  for (let i = 0; i < 20; i++) { const id = make(prefix); if (!taken.has(id)) return id }
  return `${prefix}_${taken.size}_${Date.now().toString(36)}`
}

// ---- the checks Publish makes (the server makes the same ones) ----

const label = (name: string, id: string): string => name || id

function hasCycle(parents: Map<string, string | null>): boolean {
  for (const start of parents.keys()) {
    const seen = new Set([start])
    let cur = parents.get(start) ?? null
    while (cur !== null && parents.has(cur)) {
      if (seen.has(cur)) return true
      seen.add(cur)
      cur = parents.get(cur) ?? null
    }
  }
  return false
}

// What the rig must not have when published (the server makes the same checks in the same words): a pivot chain over the limit, an anchor or a slider
// that points at something that is not there.
function rigFaults(c: ModelContent, circular: boolean, owner: Map<string, string>, holder: Map<string, string>): string[] {
  const faults: string[] = []
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  const groupIds = new Set(c.groups.map(g => g.id)), rangeIds = new Set(c.ranges.map(r => r.id))
  if (!circular) {
    for (const g of c.groups) {
      const depth = chainOf(c, g.id).length
      if (depth > LIMITS.chainMax) faults.push(`Group ${label(g.name, g.id)} is ${depth} levels deep; a pivot chain may have at most ${LIMITS.chainMax}.`)
    }
  }
  for (const g of c.groups) {
    const a = g.attach
    if (!a) continue
    const name = label(g.name, g.id), target = shapes.get(a.shape)
    if (g.parent === null) faults.push(`Group ${name} is attached to a shape but has no parent group.`)
    else if (!target) faults.push(`Group ${name} is attached to a shape that does not exist.`)
    else {
      const home = holder.get(owner.get(a.shape) ?? '') ?? ''
      if (!chainOf(c, g.parent).includes(home)) faults.push(`Group ${name} is attached to a shape that is not in its parent group or one above it.`)
      if (a.kind === 'point' && a.i >= outlineSize(c, target)) faults.push(`Group ${name} is attached to a point that does not exist.`)
      if ((a.kind === 'edge' || a.kind === 'range') && a.i >= outlineSize(c, target)) faults.push(`Group ${name} is attached to an edge that does not exist.`)
    }
    if (a.kind === 'range' && !(a.slider && rangeIds.has(a.slider))) faults.push(`Group ${name} is attached along a slider that does not exist.`)
  }
  for (const r of c.ranges) {
    const name = label(r.name, r.id)
    for (const d of r.drives) {
      if (d.kind === 'turn' && !(d.group && groupIds.has(d.group))) faults.push(`Slider ${name} turns a group that does not exist.`)
      else if (d.kind === 'scale' && d.target !== 'model' && !((d.target === 'group' && d.id && groupIds.has(d.id)) || (d.target === 'shape' && d.id && shapes.has(d.id)))) faults.push(`Slider ${name} scales something that does not exist.`)
      else if (d.kind === 'scale' && d.target === 'shape' && d.id && shapes.get(d.id)?.mirrorOf) faults.push(`Slider ${name} scales a twin; scale the original instead.`)
      else if ((d.kind === 'points' || d.kind === 'bend' || d.kind === 'fall') && !(d.shape && shapes.has(d.shape))) faults.push(`Slider ${name} moves a shape that does not exist.`)
      else if ((d.kind === 'points' || d.kind === 'bend' || d.kind === 'fall') && d.shape && shapes.get(d.shape)?.mirrorOf) faults.push(`Slider ${name} moves a shape that is a twin; move the original instead.`)
      else if (d.kind === 'points' && d.shape && d.moves.some(m => m.i >= (shapes.get(d.shape!)?.pts.length ?? 0))) faults.push(`Slider ${name} moves a point of ${label(shapes.get(d.shape)?.name ?? '', d.shape)} that is no longer there. Record it again.`)
    }
  }
  return faults
}

// Twins: the original must be there and must not be a twin itself.
function pairFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const kinds: Array<[string, Array<{ id: string; name: string; mirrorOf?: string | null }>]> = [['Shape', c.shapes], ['Object', c.objects], ['Group', c.groups]]
  for (const [kind, items] of kinds) {
    const byId = new Map(items.map(i => [i.id, i]))
    const article = kind === 'Object' ? 'an' : 'a'
    for (const i of items) {
      const src = i.mirrorOf
      if (!src) continue
      const name = label(i.name, i.id)
      if (src === i.id) faults.push(`${kind} ${name} is a twin of itself.`)
      else if (!byId.has(src)) faults.push(`${kind} ${name} is a twin of ${article} ${kind.toLowerCase()} that does not exist.`)
      else if (byId.get(src)!.mirrorOf) faults.push(`${kind} ${name} is a twin of a twin.`)
    }
  }
  return faults
}

// Point links, looseness and back outlines: what they point at must be there, links must not go round in a circle, and there are at most LIMITS.linksMax.
function linkFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  const rangeIds = new Set(c.ranges.map(r => r.id))
  const depends = new Map<string, Set<string>>()
  for (const s of c.shapes) {
    const name = label(s.name, s.id)
    for (const p of s.pts) {
      const b = p.bind
      if (!b) continue
      const target = shapes.get(b.s)
      if (b.s === s.id) faults.push(`Shape ${name} has a point linked to its own shape.`)
      else if (!target) faults.push(`Shape ${name} has a point linked to a shape that does not exist.`)
      else {
        depends.set(s.id, (depends.get(s.id) ?? new Set()).add(b.s))
        const size = outlineSize(c, target)
        if (b.kind === 'point' && b.i >= size) faults.push(`Shape ${name} has a point linked to a point that does not exist.`)
        else if (b.kind === 'edge' && b.e >= size) faults.push(`Shape ${name} has a point linked to an edge that does not exist.`)
      }
    }
    if (s.loose != null && !rangeIds.has(s.loose)) faults.push(`Shape ${name} takes its looseness from a slider that does not exist.`)
    if (s.back != null && s.back.length < 3) faults.push(`Shape ${name} has a back outline of fewer than 3 points.`)
  }
  for (const s of c.shapes) {
    const seen = new Set<string>(), stack = [...(depends.get(s.id) ?? [])]
    while (stack.length) {
      const cur = stack.pop()!
      if (cur === s.id) { faults.push(`The point links of shape ${label(s.name, s.id)} go round in a circle.`); break }
      if (seen.has(cur)) continue
      seen.add(cur)
      stack.push(...(depends.get(cur) ?? []))
    }
  }
  if (linkCount(c) > LIMITS.linksMax) faults.push(`A model may have at most ${LIMITS.linksMax} point links.`)
  return faults
}

// Forms: a form may only change shapes of its own object, never a twin's, and an outline is empty (the shape is hidden in that form) or has at least three points.
function formFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  for (const o of c.objects) {
    const obj = label(o.name, o.id), own = new Set(o.shapes)
    for (const axis of o.axes ?? []) {
      if (!axis.options.some(f => f.id === axis.initial)) faults.push(`Axis ${label(axis.name, axis.id)} of object ${obj} has a default form that does not exist.`)
      for (const form of axis.options) {
        const name = label(form.name, form.id)
        for (const ov of form.ovr) {
          const shape = shapes.get(ov.shape)
          if (!own.has(ov.shape) || !shape) faults.push(`Form ${name} of ${obj} changes a shape that is not in the object.`)
          else if (shape.mirrorOf) faults.push(`Form ${name} of ${obj} changes a twin; change the original instead.`)
          else if (ov.pts.length > 0 && ov.pts.length < 3) faults.push(`Form ${name} of ${obj} has an outline of fewer than 3 points for shape ${label(shape.name, shape.id)}.`)
        }
      }
    }
  }
  return faults
}

// Classes: the template must be an ordinary object, a member must belong to a class that is there, a shape that follows another must be in a member and
// follow a shape of its class's template, and a class has at most LIMITS.membersMax members.
function classFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const objects = new Map(c.objects.map(o => [o.id, o])), shapes = new Map(c.shapes.map(s => [s.id, s])), classes = new Map((c.classes ?? []).map(k => [k.id, k]))
  const templates = new Map<string, number>()
  for (const k of c.classes ?? []) {
    const name = label(k.name, k.id), tpl = objects.get(k.template)
    templates.set(k.template, (templates.get(k.template) ?? 0) + 1)
    if (!tpl) { faults.push(`Class ${name} has a template that does not exist.`); continue }
    if (tpl.classOf) faults.push(`Class ${name} has a template that is a member of a class.`)
    if (tpl.mirrorOf) faults.push(`Class ${name} has a template that is a twin; use the original.`)
    if (c.objects.filter(o => o.classOf === k.id).length > LIMITS.membersMax) faults.push(`Class ${name} has more than ${LIMITS.membersMax} members.`)
  }
  for (const [oid, n] of templates) { const o = objects.get(oid); if (n > 1 && o) faults.push(`Object ${label(o.name, oid)} is the template of more than one class.`) }
  for (const o of c.objects) {
    if (o.classOf && !classes.has(o.classOf)) faults.push(`Object ${label(o.name, o.id)} is a member of a class that does not exist.`)
    else if (o.classOf && classes.get(o.classOf)!.template === o.id) faults.push(`Object ${label(o.name, o.id)} is a member of the class it is the template of.`)
  }
  const memberOf = new Map<string, ModelObject>()
  for (const o of c.objects) if (o.classOf) for (const sid of o.shapes) memberOf.set(sid, o)
  for (const s of c.shapes) {
    if (!s.copyOf) continue
    const name = label(s.name, s.id), member = memberOf.get(s.id), target = shapes.get(s.copyOf)
    const cls = member ? classes.get(member.classOf ?? '') : undefined
    if (!member) faults.push(`Shape ${name} copies a shape but is not in a member of a class.`)
    else if (!target) faults.push(`Shape ${name} copies a shape that does not exist.`)
    else if (!cls || !(objects.get(cls.template)?.shapes ?? []).includes(target.id)) faults.push(`Shape ${name} copies a shape that is not in the template of its class.`)
    else if (target.mirrorOf) faults.push(`Shape ${name} copies a twin; copy the original.`)
  }
  return faults
}

// Whether a style's form choice names an axis and form (or, for "class:id", a member) that are there. A member chooses among its template's axes.
function styleChoiceExists(c: ModelContent, key: string, value: string): boolean {
  if (key.startsWith('class:')) return (c.classes ?? []).some(k => k.id === key.slice(6)) && c.objects.some(o => o.id === value && o.classOf === key.slice(6))
  const classes = new Map((c.classes ?? []).map(k => [k.id, k])), objects = new Map(c.objects.map(o => [o.id, o]))
  for (const o of c.objects) {
    if (!key.startsWith(`${o.id}.`)) continue
    const owner = (o.classOf && objects.get(classes.get(o.classOf)?.template ?? '')) || o
    const axisId = key.slice(o.id.length + 1)
    if ((owner.axes ?? []).some(a => a.id === axisId && a.options.some(f => f.id === value))) return true
  }
  return false
}

// Presets and styles: the sliders they set and the objects and groups they hide must be there, a style's scope must exist and the forms it chooses must be there.
function presetFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const rangeIds = new Set(c.ranges.map(r => r.id)), objects = new Map(c.objects.map(o => [o.id, o])), thingIds = new Set([...objects.keys(), ...c.groups.map(g => g.id)])
  const slots = new Map((c.slots ?? []).map(sl => [sl.id, sl])), presets = new Map((c.presets ?? []).map(p => [p.id, p]))
  for (const p of c.presets ?? []) {
    const name = label(p.name, p.id)
    // a style of an object may also hide shapes of that object
    const scopeObject = p.scope ? objects.get(p.scope) : undefined, hideable = new Set([...thingIds, ...(scopeObject?.shapes ?? [])])
    if (Object.keys(p.values).some(k => !rangeIds.has(k))) faults.push(`Preset ${name} sets a slider that does not exist.`)
    if (p.hidden.some(h => !hideable.has(h))) faults.push(`Preset ${name} hides something that does not exist.`)
    if (p.scope && !thingIds.has(p.scope)) faults.push(`Preset ${name} belongs to something that does not exist.`)
    if (Object.entries(p.forms ?? {}).some(([k, v]) => !styleChoiceExists(c, k, v))) faults.push(`Preset ${name} chooses a form that does not exist.`)
    // phase D3a: the style of each object a variant turns on, the default colour of each slot it picks, the parts of a colour a style holds, the order of shapes
    if (Object.entries(p.styles ?? {}).some(([o, st]) => !objects.has(o) || presets.get(st)?.scope !== o)) faults.push(`Preset ${name} turns on a style that does not exist.`)
    if (Object.entries(p.picks ?? {}).some(([sl, k]) => !slots.get(sl)?.colours.some(x => x.id === k))) faults.push(`Preset ${name} picks a colour that does not exist.`)
    if (Object.keys(p.hsl ?? {}).some(sl => !slots.has(sl))) faults.push(`Preset ${name} locks a colour of a slot that does not exist.`)
    if ((p.order ?? []).length > 0 && (!scopeObject || p.order!.some(id => !scopeObject.shapes.includes(id)))) faults.push(`Preset ${name} puts shapes in order that are not in its object.`)
  }
  return faults
}

// What is wrong with the colour of a model (the server's _colour_faults says the same words).
function colourFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const slotIds = new Set((c.slots ?? []).map(sl => sl.id)), genreIds = new Set((c.genres ?? []).map(g => g.id))
  for (const s of c.shapes) if (s.slot && !slotIds.has(s.slot)) faults.push(`Shape ${label(s.name, s.id)} uses a colour slot that does not exist.`)
  for (const sl of c.slots ?? []) for (const k of sl.colours) if (k.genres.some(g => !genreIds.has(g))) faults.push(`Colour ${label(k.name, k.id)} of slot ${label(sl.name, sl.id)} fits a genre that does not exist.`)
  for (const o of c.objects) if (Object.keys(o.hsl ?? {}).some(sl => !slotIds.has(sl))) faults.push(`Object ${label(o.name, o.id)} locks a colour of a slot that does not exist.`)
  return faults
}

// What is wrong with the paint effects of a model (the server's _paint_faults says the same words): a clip or a cut-out that points at nothing, a gradient to a
// slot that is not there, a form that changes the paint of a shape it should not, and too many shading shapes in an object.
function paintFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const shapes = new Map(c.shapes.map(s => [s.id, s])), slotIds = new Set((c.slots ?? []).map(sl => sl.id)), rangeIds = new Set(c.ranges.map(r => r.id))
  for (const s of c.shapes) {
    const name = label(s.name, s.id)
    if (s.opBy && !rangeIds.has(s.opBy.slider)) faults.push(`Shape ${name} fades with a slider that does not exist.`)
    if (s.clip) {
      if (s.clip === s.id) faults.push(`Shape ${name} is clipped to itself.`)
      else if (!shapes.has(s.clip)) faults.push(`Shape ${name} is clipped to a shape that does not exist.`)
    }
    for (const t of s.cut ?? []) {
      if (t === s.id) faults.push(`Shape ${name} is cut by itself.`)
      else if (!shapes.has(t)) faults.push(`Shape ${name} is cut by a shape that does not exist.`)
    }
    if (s.grad?.to && !slotIds.has(s.grad.to)) faults.push(`Shape ${name} has a gradient to a colour slot that does not exist.`)
  }
  for (const o of c.objects) {
    const obj = label(o.name, o.id), own = new Set(o.shapes)
    if (shadingCount(c, o.id) > LIMITS.shadesMax) faults.push(`Object ${obj} has more than ${LIMITS.shadesMax} shading shapes.`)
    for (const axis of o.axes ?? []) {
      for (const form of axis.options) {
        const fname = label(form.name, form.id)
        for (const look of form.looks ?? []) {
          const shape = shapes.get(look.shape)
          if (!own.has(look.shape) || !shape) faults.push(`Form ${fname} of ${obj} changes the paint of a shape that is not in the object.`)
          else if (shape.mirrorOf) faults.push(`Form ${fname} of ${obj} changes the paint of a twin; change the original instead.`)
          else if (look.slot && !slotIds.has(look.slot)) faults.push(`Form ${fname} of ${obj} paints shape ${label(shape.name, shape.id)} from a colour slot that does not exist.`)
        }
      }
    }
  }
  return faults
}

// What is wrong with the skeleton, the fit of objects and the frames (the server's _proportion_faults says the same words).
// What is wrong with the grip points (the server's _hand_faults says the same words).
function handFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const groupIds = new Set(c.groups.map(g => g.id)), gripIds = new Set((c.grips ?? []).map(g => g.id))
  for (const g of c.grips ?? []) if (!g.group || !groupIds.has(g.group)) faults.push(`Grip ${label(g.name, g.id)} is on a group that does not exist.`)
  for (const p of c.presets ?? []) if (p.grip && !gripIds.has(p.grip)) faults.push(`Preset ${label(p.name, p.id)} holds with a grip that does not exist.`)
  return faults
}

function proportionFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const groupIds = new Set(c.groups.map(g => g.id)), twinGroups = new Set(c.groups.filter(g => g.mirrorOf).map(g => g.id))
  const shapes = new Map(c.shapes.map(s => [s.id, s])), bones = new Map((c.bones ?? []).map(b => [b.id, b]))
  const thingIds = new Set([...c.objects.map(o => o.id), ...groupIds])
  for (const b of c.bones ?? []) {
    const name = label(b.name, b.id)
    if (!groupIds.has(b.start)) faults.push(`Bone ${name} starts at a group that does not exist.`)
    else if (twinGroups.has(b.start)) faults.push(`Bone ${name} starts at a twin group; use the original.`)
    if (b.end.kind === 'group') { if (!groupIds.has(b.end.id)) faults.push(`Bone ${name} ends at a group that does not exist.`) }
    else if (!shapes.has(b.end.id)) faults.push(`Bone ${name} ends at a shape that does not exist.`)
    else if (b.end.i >= outlineSize(c, shapes.get(b.end.id)!)) faults.push(`Bone ${name} ends at a point that does not exist.`)
  }
  for (const r of c.ranges) for (const d of r.drives) if (d.kind === 'length' && !(d.id && bones.has(d.id))) faults.push(`Slider ${label(r.name, r.id)} changes the length of a bone that does not exist.`)
  if (c.headBone && !bones.has(c.headBone)) faults.push('The head bone does not exist.')
  for (const o of c.objects) {
    if (o.fit !== 'stretch') continue
    const name = label(o.name, o.id)
    if (!o.fitTo) faults.push(`Object ${name} stretches to a shape but has none chosen.`)
    else if (!shapes.has(o.fitTo)) faults.push(`Object ${name} stretches to a shape that does not exist.`)
    else if (o.shapes.includes(o.fitTo)) faults.push(`Object ${name} stretches to a shape of its own.`)
  }
  for (const f of c.frames ?? []) if (f.hide.some(h => !thingIds.has(h))) faults.push(`Frame ${label(f.name, f.id)} hides something that does not exist.`)
  return faults
}

export function publishFaults(c: ModelContent): string[] {
  const faults: string[] = []
  if (!c.name.trim()) faults.push('The model needs a name.')
  const shapeIds = new Set(c.shapes.map(s => s.id)), objectIds = new Set(c.objects.map(o => o.id)), groupIds = new Set(c.groups.map(g => g.id))
  for (const s of c.shapes) if (s.pts.length < 3 && !s.mirrorOf && !(s.copyOf && s.pts.length === 0)) faults.push(`Shape ${label(s.name, s.id)} needs at least 3 points.`)
  const owner = new Map<string, string>()
  for (const o of c.objects) {
    for (const sid of o.shapes) {
      if (!shapeIds.has(sid)) faults.push(`Object ${label(o.name, o.id)} lists a shape that does not exist.`)
      else if (owner.has(sid) && owner.get(sid) !== o.id) faults.push(`A shape is in more than one object (${label(o.name, o.id)}).`)
      else owner.set(sid, o.id)
    }
  }
  const holder = new Map<string, string>()
  for (const g of c.groups) {
    for (const oid of g.objects) {
      if (!objectIds.has(oid)) faults.push(`Group ${label(g.name, g.id)} lists an object that does not exist.`)
      else if (holder.has(oid) && holder.get(oid) !== g.id) faults.push(`An object is in more than one group (${label(g.name, g.id)}).`)
      else holder.set(oid, g.id)
    }
    if (g.parent !== null && !groupIds.has(g.parent)) faults.push(`Group ${label(g.name, g.id)} has a parent that does not exist.`)
  }
  const circular = hasCycle(new Map(c.groups.map(g => [g.id, g.parent])))
  if (circular) faults.push('The groups are linked in a circle.')
  faults.push(...rigFaults(c, circular, owner, holder))
  faults.push(...pairFaults(c))
  faults.push(...linkFaults(c))
  faults.push(...formFaults(c))
  faults.push(...classFaults(c))
  faults.push(...presetFaults(c))
  faults.push(...colourFaults(c))
  faults.push(...paintFaults(c))
  faults.push(...proportionFaults(c))
  faults.push(...handFaults(c))
  const bytes = copyBytes(c)
  if (bytes > LIMITS.copyMaxBytes) faults.push(`A character's copy of this model would be ${Math.floor(bytes / 1024)} KB; the limit is ${LIMITS.copyMaxBytes / 1024} KB.`)
  return faults
}

// Whether the draft is what was published (names and tree alike).
export const sameContent = (a: ModelContent, b: ModelContent): boolean => JSON.stringify(normalizeContent(a)) === JSON.stringify(normalizeContent(b))

export type PublishState = 'draft' | 'published' | 'changed' | 'unpublished'
// Where a model stands: never published, published and unchanged, published with edits since, or taken off (it has versions but none is live).
export function publishState(e: ModelEntry): PublishState {
  if (e.published) return sameContent(e.draft, e.published.content) ? 'published' : 'changed'
  return e.history.length ? 'unpublished' : 'draft'
}
