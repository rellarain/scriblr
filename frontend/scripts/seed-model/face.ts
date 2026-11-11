// The face of the seed model: the head, ears, brows, eyes, nose and mouth as the old portrait engine drew them, one object each with a form for every option of that part.
// An option is a different set of outlines for the same shapes: the shapes of all options are merged into "channels" (a shape with the same paint, in the same place in the
// paint order), so a form only says which outline each channel has (or that it has none). Outlines are the old curves fitted with few points; a left and a right outline that
// mirror each other are one shape and its twin.
import type { ModelAxis, ModelContent, ModelForm, ModelObject, ModelPoint, ModelShape, ModelTint } from '../../src/api/types'
import { makeTwin } from '../../src/assets/Interfaces/admin/characters/engine/pairEdit'
import type { MakeId } from '../../src/assets/Interfaces/admin/characters/modelContent'
import type { ExactData, ExactShape } from './exact'
import { exactList, mirrorGap, outlineGap, refit } from './outline'

export interface Look { slot: string | null; gray: number | null; derive: ModelTint | null; op: number }

// The slot each colour of the old engine becomes.
const SLOT: Record<string, string> = { skin: 'k_skin', hair: 'k_hair', brow: 'k_hair', lip: 'k_lip', eye: 'k_eye', top: 'k_cloth', facial: 'k_hair' }

function grayOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return Math.round(((Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255) * 100)
}

// How the old engine's colour of a shape becomes the model's paint: a slot (and a shadow of it: the old `shade(colour, t)`), or a fixed gray for a white or a dark that is not the
// character's.
export function lookOf(s: ExactShape): Look {
  const c = s.c
  if (!c || c[0] === 'white' || !SLOT[c[0]]) return { slot: null, gray: grayOf(c && c[0] === 'white' ? '#ffffff' : s.f), derive: null, op: s.o }
  const slot = SLOT[c[0]]
  if (c[0] === 'brow' && c[1] === 'base') return { slot, gray: null, derive: { kind: 'shadow', t: 0.1 }, op: s.o }
  if (c[1] === 'shade' || c[1] === 'tone') return { slot, gray: null, derive: { kind: 'shadow', t: c[2] }, op: s.o }
  if (c[1] !== 'base') throw new Error(`unknown colour rule ${JSON.stringify(c)}`)
  return { slot, gray: null, derive: null, op: s.o }
}
export const sigOf = (l: Look): string => JSON.stringify([l.slot, l.gray, l.derive?.t ?? 0, l.op])

interface Item { look: Look; sig: string; pts: ModelPoint[]; paired: boolean }

const selfSymmetric = (list: ModelPoint[]): boolean => mirrorGap(list, list) < 0.12

// Two looks that paint the same thing with a tone of it that may differ a little (the old drawing shaded the ear in the light a little less than the other).
const sameKind = (a: Look, b: Look): boolean => a.slot === b.slot && a.gray === b.gray && a.op === b.op && (a.derive?.kind ?? '') === (b.derive?.kind ?? '')
const cx = (list: ModelPoint[]): number => list.reduce((n, p) => n + p.x, 0) / list.length
const tiny = (list: ModelPoint[]): boolean => {
  const xs = list.map(p => p.x), ys = list.map(p => p.y)
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 2.5
}

// The shapes of one option as items: a left outline with its mirrored right outline is one paired item; a shape on its own stays a single.
function itemsOf(shapes: ExactShape[], tol: number): Item[] {
  const lists = shapes.map(s => (s.n.length >= 3 ? refit(exactList(s.n), tol) : []))
  const taken = new Set<number>(), out: Item[] = []
  shapes.forEach((s, i) => {
    if (taken.has(i) || lists[i].length < 3) return
    taken.add(i)
    const look = lookOf(s), sig = sigOf(look)
    let twin = -1
    if (!selfSymmetric(lists[i])) {
      for (let j = i + 1; j < shapes.length; j++) {
        if (taken.has(j) || lists[j].length < 3 || !sameKind(look, lookOf(shapes[j]))) continue
        // a mirror image, or a tiny shape (a gleam in an eye) on the other side of the face: the old drawing lit both from the upper left, the model mirrors them
        if (mirrorGap(lists[i], lists[j]) < 0.15 || (tiny(lists[i]) && tiny(lists[j]) && (cx(lists[i]) - 100) * (cx(lists[j]) - 100) < 0)) { twin = j; break }
      }
    }
    if (twin >= 0) taken.add(twin)
    out.push({ look, sig, pts: lists[i], paired: twin >= 0 })
  })
  return out
}

export interface PartSpec {
  part: string          // the old engine's name of the part (the `p` of its shapes)
  options: string       // the key of its options
  objectId: string
  objectName: string
  axisId: string
  axisName: string
  defaultOption: string
  z: number
  prefix: string
  firstId?: string
  view?: 'front' | 'both'
  names?: string[]
}

interface Channel { id: string; sig: string; paired: boolean; look: Look; byOption: Map<string, ModelPoint[]> }

export interface PartResult {
  shapes: ModelShape[]
  object: ModelObject
  pairs: 'object' | 'shape' | 'none'
  paired: Set<string>
  channels: number
  points: number
}

const same = (a: ModelPoint[], b: ModelPoint[]): boolean => a.length === b.length && outlineGap(a, b) < 0.004

export function buildPart(data: ExactData, spec: PartSpec, tol: number): PartResult {
  const options = data.options[spec.options]
  const defaultShapes = data.shapes.filter(s => s.p === spec.part)
  const channels: Channel[] = []
  const place = (optId: string, items: Item[]) => {
    let cursor = -1
    for (const item of items) {
      let at = channels.findIndex((ch, i) => i > cursor && ch.sig === item.sig && ch.paired === item.paired && !ch.byOption.has(optId))
      if (at < 0) {
        channels.splice(cursor + 1, 0, { id: '', sig: item.sig, paired: item.paired, look: item.look, byOption: new Map() })
        at = cursor + 1
      }
      channels[at].byOption.set(optId, item.pts)
      cursor = at
    }
  }
  // the option that is the default goes first: it fixes the base outlines and the paint order the others are fitted into
  const ordered = [...options].sort((a, b) => (a.id === spec.defaultOption ? -1 : b.id === spec.defaultOption ? 1 : 0))
  for (const o of ordered) place(o.id, itemsOf(o.shapes, tol))
  // the default adult's own shapes should be the default option's: a check that the export agrees with itself
  const def = options.find(o => o.id === spec.defaultOption)
  if (def && def.shapes.length !== defaultShapes.length) throw new Error(`${spec.part}: the default adult has ${defaultShapes.length} shapes but its default option has ${def.shapes.length}`)

  channels.forEach((ch, k) => { ch.id = k === 0 && spec.firstId ? spec.firstId : `${spec.prefix}_${k}` })
  const baseOf = (ch: Channel): ModelPoint[] => ch.byOption.get(spec.defaultOption) ?? ch.byOption.values().next().value!
  const shapes: ModelShape[] = channels.map((ch, k) => ({
    id: ch.id,
    name: spec.names?.[k] ?? `${spec.objectName} ${k + 1}`,
    closed: true,
    z: Math.round((spec.z + k * 0.003) * 10000) / 10000,
    op: ch.look.op,
    view: spec.view ?? 'front',
    pts: baseOf(ch),
    half: 0,
    slot: ch.look.slot,
    gray: ch.look.gray,
    ...(ch.look.derive ? { derive: ch.look.derive } : {}),
  }))
  const formsOf = (): ModelForm[] => options.map(o => {
    const ovr: ModelForm['ovr'] = []
    for (const ch of channels) {
      const mine = ch.byOption.get(o.id)
      if (!mine) { ovr.push({ shape: ch.id, pts: [] }); continue }
      if (!same(mine, baseOf(ch))) ovr.push({ shape: ch.id, pts: mine })
    }
    return { id: o.id, name: o.name, ovr }
  })
  const axis: ModelAxis = { id: spec.axisId, name: spec.axisName, options: formsOf(), initial: spec.defaultOption }
  const object: ModelObject = { id: spec.objectId, name: spec.objectName, layer: 'body', shapes: shapes.map(s => s.id), axes: [axis] }
  const pairs = channels.length > 0 && channels.every(c => c.paired) ? 'object' : channels.some(c => c.paired) ? 'shape' : 'none'
  const points = shapes.reduce((n, s) => n + s.pts.length, 0) + axis.options.reduce((n, f) => n + f.ovr.reduce((m, o) => m + o.pts.length, 0), 0)
  return { shapes, object, pairs, paired: new Set(channels.filter(c => c.paired).map(c => c.id)), channels: channels.length, points }
}

// Gives the paired shapes of a part their twins: the twin of the whole object when every shape is paired (each eye scales about its own middle), the twin of each paired shape
// otherwise (a nose is one object).
export function pairUp(c: ModelContent, result: PartResult, make: MakeId): ModelContent {
  let next = c
  if (result.pairs === 'object') {
    const e = makeTwin(next, 'object', result.object.id, make)
    if (!e.ok) throw new Error(e.reason)
    next = e.content
  } else if (result.pairs === 'shape') {
    for (const id of result.object.shapes) {
      if (!result.paired.has(id)) continue
      const e = makeTwin(next, 'shape', id, make)
      if (!e.ok) throw new Error(e.reason)
      next = e.content
    }
  }
  return next
}
