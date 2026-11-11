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
const SLOT: Record<string, string> = {
  skin: 'k_skin', hair: 'k_hair', brow: 'k_hair', lip: 'k_lip', eye: 'k_eye', top: 'k_cloth', facial: 'k_hair',
  eye2: 'k_eye2', horn: 'k_horn', necklace: 'k_metal', crown: 'k_metal', hood: 'k_hood', item: 'k_item',
}

// The colours the old drawing painted with that are not the character's own and not a gray: a gem, a leaf, a petal. Each becomes a slot of its own (a model is gray until a
// colour is chosen), with the tone it was: the key is the hex the old engine used. Anything not here and not nearly gray is an error, so none is lost without being seen.
const LITERAL: Record<string, { slot: string; derive?: ModelTint }> = {
  '#2882c0': { slot: 'k_gem' }, '#2b75ad': { slot: 'k_gem' }, '#a9cde6': { slot: 'k_gem', derive: { kind: 'highlight', t: 0.6 } }, '#aac8de': { slot: 'k_gem', derive: { kind: 'highlight', t: 0.6 } },
  '#6c5685': { slot: 'k_gem', derive: { kind: 'shadow', t: 0.3 } },
  '#4f7a3a': { slot: 'k_leaf', derive: { kind: 'shadow', t: 0.15 } }, '#5f8a3e': { slot: 'k_leaf' },
  '#f3d27a': { slot: 'k_bloom' }, '#bdd94a': { slot: 'k_bloom', derive: { kind: 'shadow', t: 0.12 } },
  // the materials of the held items: a crystal (a gem), wood, parchment, a flame and the glow of a light, a drink (the tones are few, so the items share the shapes of the object they are forms of)
  '#2e8094': { slot: 'k_gem' }, '#abccd4': { slot: 'k_gem', derive: { kind: 'highlight', t: 0.5 } }, '#82b3bf': { slot: 'k_gem', derive: { kind: 'highlight', t: 0.3 } },
  '#21667a': { slot: 'k_gem', derive: { kind: 'shadow', t: 0.3 } },
  '#6b4a2a': { slot: 'k_wood' }, '#4a3220': { slot: 'k_wood', derive: { kind: 'shadow', t: 0.3 } }, '#a67836': { slot: 'k_wood', derive: { kind: 'highlight', t: 0.3 } },
  '#f2ead6': { slot: 'k_paper' }, '#e9dfc6': { slot: 'k_paper' }, '#e8dcc0': { slot: 'k_paper' }, '#dac493': { slot: 'k_paper', derive: { kind: 'shadow', t: 0.1 } },
  '#dcc899': { slot: 'k_paper', derive: { kind: 'shadow', t: 0.1 } }, '#f1e8d0': { slot: 'k_paper' }, '#e6d4a5': { slot: 'k_paper', derive: { kind: 'shadow', t: 0.1 } },
  '#faf4e2': { slot: 'k_paper', derive: { kind: 'highlight', t: 0.5 } }, '#cfb574': { slot: 'k_paper', derive: { kind: 'shadow', t: 0.2 } },
  '#ffb347': { slot: 'k_flame' }, '#f08a24': { slot: 'k_flame', derive: { kind: 'shadow', t: 0.2 } }, '#ffd34d': { slot: 'k_flame', derive: { kind: 'highlight', t: 0.3 } },
  '#fff6c8': { slot: 'k_flame', derive: { kind: 'highlight', t: 0.75 } },
  '#ffd98a': { slot: 'k_flame', derive: { kind: 'highlight', t: 0.3 } }, '#fff3c8': { slot: 'k_flame', derive: { kind: 'highlight', t: 0.75 } }, '#fff3b0': { slot: 'k_flame', derive: { kind: 'highlight', t: 0.5 } },
  '#fff6c4': { slot: 'k_flame', derive: { kind: 'highlight', t: 0.75 } },
  '#7a1f2e': { slot: 'k_wine' }, '#651623': { slot: 'k_wine', derive: { kind: 'shadow', t: 0.2 } }, '#9c2a3d': { slot: 'k_wine', derive: { kind: 'highlight', t: 0.2 } },
}
const chroma = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255
}

function grayOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return Math.round(((Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255) * 100)
}

// How the old engine's colour of a shape becomes the model's paint: a slot (and a shadow of it: the old `shade(colour, t)`), or a fixed gray for a white or a dark that is not the
// character's.
export function lookOf(s: ExactShape): Look {
  const c = s.c
  if (!c && LITERAL[s.f.toLowerCase()]) { const l = LITERAL[s.f.toLowerCase()]; return { slot: l.slot, gray: null, derive: l.derive ?? null, op: s.o } }
  if (!c && chroma(s.f) > 0.3) throw new Error(`a colour of the old drawing has no slot: ${s.f}`)
  if (!c || c[0] === 'white' || !SLOT[c[0]]) return { slot: null, gray: grayOf(c && c[0] === 'white' ? '#ffffff' : s.f), derive: null, op: s.o }
  const slot = SLOT[c[0]]
  if (c[0] === 'brow' && c[1] === 'base') return { slot, gray: null, derive: { kind: 'shadow', t: 0.1 }, op: s.o }
  if (c[1] === 'shade' || c[1] === 'tone') return { slot, gray: null, derive: { kind: 'shadow', t: c[2] }, op: s.o }
  if (c[1] === 'light') return { slot, gray: null, derive: { kind: 'highlight', t: c[2] }, op: s.o }
  if (c[1] !== 'base') throw new Error(`unknown colour rule ${JSON.stringify(c)}`)
  return { slot, gray: null, derive: null, op: s.o }
}
export const sigOf = (l: Look): string => JSON.stringify([l.slot, l.gray, l.derive?.t ?? 0, l.op])

interface Item { look: Look; sig: string; part: string; pts: ModelPoint[]; paired: boolean }

const selfSymmetric = (list: ModelPoint[]): boolean => mirrorGap(list, list) < 0.12

// Two looks that paint the same thing with a tone of it that may differ a little (the old drawing shaded the ear in the light a little less than the other).
const sameKind = (a: Look, b: Look): boolean => a.slot === b.slot && a.gray === b.gray && a.op === b.op && (a.derive?.kind ?? '') === (b.derive?.kind ?? '')
const cx = (list: ModelPoint[]): number => list.reduce((n, p) => n + p.x, 0) / list.length
const tiny = (list: ModelPoint[]): boolean => {
  const xs = list.map(p => p.x), ys = list.map(p => p.y)
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 2.5
}

// The shapes of one option as items: a left outline with its mirrored right outline is one paired item; a shape on its own stays a single.
function itemsOf(shapes: ExactShape[], tol: number, pairing = true): Item[] {
  const lists = shapes.map(s => (s.n.length >= 3 ? refit(exactList(s.n), tol) : []))
  const taken = new Set<number>(), out: Item[] = []
  shapes.forEach((s, i) => {
    if (taken.has(i) || lists[i].length < 3) return
    taken.add(i)
    const look = lookOf(s), sig = `${s.p}|${sigOf(look)}`
    let twin = -1
    if (pairing && !selfSymmetric(lists[i])) {
      for (let j = i + 1; j < shapes.length; j++) {
        if (taken.has(j) || lists[j].length < 3 || !sameKind(look, lookOf(shapes[j]))) continue
        // a mirror image, or a tiny shape (a gleam in an eye) on the other side of the face: the old drawing lit both from the upper left, the model mirrors them
        if (mirrorGap(lists[i], lists[j]) < 0.15 || (tiny(lists[i]) && tiny(lists[j]) && (cx(lists[i]) - 100) * (cx(lists[j]) - 100) < 0)) { twin = j; break }
      }
    }
    if (twin >= 0) taken.add(twin)
    out.push({ look, sig, part: s.p, pts: lists[i], paired: twin >= 0 })
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
  layer?: ModelObject['layer']
  tol?: number                    // how far a fitted outline may be from the old one, where the part can stand a looser fit (a horn, a hood)
  coarse?: boolean                // points to a tenth of a unit, not a hundredth
  noPairs?: boolean               // every shape stays a shape of its own, none is the twin of another
  zOf?: Record<string, number>   // the z of the channels of a part of the old drawing, where it is not `z` (a hood hangs behind the body)
  roll?: number                  // how often Randomise changes the axis (percent), and in which genres (none: any)
  genres?: string[]
  // more axes of forms for the same shapes: their options are laid on the channels of the first (a style of an eye for each shape of an eye); an axis listed here wins over the first
  also?: Array<{ options: string; axisId: string; axisName: string; defaultOption: string; roll?: number; genres?: string[] }>
}

interface Channel { id: string; sig: string; part: string; paired: boolean; look: Look; byOption: Map<string, ModelPoint[]> }

export interface PartResult {
  shapes: ModelShape[]
  object: ModelObject
  pairs: 'object' | 'shape' | 'none'
  paired: Set<string>
  channels: number
  points: number
}

const same = (a: ModelPoint[], b: ModelPoint[]): boolean => a.length === b.length && outlineGap(a, b) < 0.004

export function buildPart(data: ExactData, spec: PartSpec, baseTol: number): PartResult {
  const tol = spec.tol ?? baseTol
  const options = data.options[spec.options]
  const defaultShapes = data.shapes.filter(s => s.p === spec.part)
  const channels: Channel[] = []
  const place = (optId: string, items: Item[]) => {
    let cursor = -1
    for (const item of items) {
      let at = channels.findIndex((ch, i) => i > cursor && ch.sig === item.sig && ch.paired === item.paired && !ch.byOption.has(optId))
      if (at < 0) {
        channels.splice(cursor + 1, 0, { id: '', sig: item.sig, part: item.part, paired: item.paired, look: item.look, byOption: new Map() })
        at = cursor + 1
      }
      channels[at].byOption.set(optId, item.pts)
      cursor = at
    }
  }
  // the option that is the default goes first: it fixes the base outlines and the paint order the others are fitted into
  const ordered = [...options].sort((a, b) => (a.id === spec.defaultOption ? -1 : b.id === spec.defaultOption ? 1 : 0))
  for (const o of ordered) place(o.id, itemsOf(o.shapes, tol, !spec.noPairs))
  // the options of the other axes lie on the same channels, under names of their own
  const others = (spec.also ?? []).map(a => ({ ...a, list: [...data.options[a.options]].sort((x, y) => (x.id === a.defaultOption ? -1 : y.id === a.defaultOption ? 1 : 0)), key: (id: string) => `${a.axisId}:${id}` }))
  for (const a of others) for (const o of a.list) place(a.key(o.id), itemsOf(o.shapes, tol, !spec.noPairs))
  // the default adult's own shapes should be the default option's: a check that the export agrees with itself
  const def = options.find(o => o.id === spec.defaultOption)
  if (def && def.shapes.length !== defaultShapes.length) throw new Error(`${spec.part}: the default adult has ${defaultShapes.length} shapes but its default option has ${def.shapes.length}`)

  channels.forEach((ch, k) => { ch.id = k === 0 && spec.firstId ? spec.firstId : `${spec.prefix}_${k}` })
  const baseOf = (ch: Channel): ModelPoint[] => ch.byOption.get(spec.defaultOption) ?? ch.byOption.values().next().value!
  // the drawing is a hundred times larger than a tenth of a unit, and a coordinate to the tenth is a third shorter to write
  const tenth = (list: ModelPoint[]): ModelPoint[] => (spec.coarse ? list.map(p => ({ ...p, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, ...(p.hi ? { hi: [Math.round(p.hi[0] * 10) / 10, Math.round(p.hi[1] * 10) / 10] as [number, number] } : {}), ...(p.ho ? { ho: [Math.round(p.ho[0] * 10) / 10, Math.round(p.ho[1] * 10) / 10] as [number, number] } : {}) })) : list)
  for (const ch of channels) ch.byOption = new Map([...ch.byOption].map(([k, v]) => [k, tenth(v)]))
  const shapes: ModelShape[] = channels.map((ch, k) => ({
    id: ch.id,
    name: spec.names?.[k] ?? `${spec.objectName} ${k + 1}`,
    closed: true,
    z: Math.round(((spec.zOf?.[ch.part] ?? spec.z) + k * 0.003) * 10000) / 10000,
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
  const chance = (roll?: number, genres?: string[]) => ({ ...(roll !== undefined ? { roll } : {}), ...(genres ? { genres } : {}) })
  const axis: ModelAxis = { id: spec.axisId, name: spec.axisName, options: formsOf(), initial: spec.defaultOption, ...chance(spec.roll, spec.genres) }
  // an option of another axis only says where it differs from the base: a channel it draws as the base does is left to the first axis (the shape of an eye), and one it leaves out
  // is hidden only where the axis's own default draws it
  const alsoAxes: ModelAxis[] = others.map(a => ({
    id: a.axisId, name: a.axisName, initial: a.defaultOption, ...chance(a.roll, a.genres),
    options: a.list.map((o): ModelForm => {
      const ovr: ModelForm['ovr'] = []
      if (o.id !== a.defaultOption) for (const ch of channels) {
        const mine = ch.byOption.get(a.key(o.id))
        if (mine) { if (!same(mine, baseOf(ch))) ovr.push({ shape: ch.id, pts: mine }) } else if (ch.byOption.has(a.key(a.defaultOption))) ovr.push({ shape: ch.id, pts: [] })
      }
      return { id: o.id, name: o.name, ovr }
    }),
  }))
  const axes = [...alsoAxes, axis]
  const object: ModelObject = { id: spec.objectId, name: spec.objectName, layer: spec.layer ?? 'body', shapes: shapes.map(s => s.id), axes }
  const pairs = channels.length > 0 && channels.every(c => c.paired) ? 'object' : channels.some(c => c.paired) ? 'shape' : 'none'
  const points = shapes.reduce((n, s) => n + s.pts.length, 0) + axes.reduce((t, ax) => t + ax.options.reduce((n, f) => n + f.ovr.reduce((m, o) => m + o.pts.length, 0), 0), 0)
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
