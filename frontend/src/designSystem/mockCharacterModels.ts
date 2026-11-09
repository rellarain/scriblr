import type { ModelContent, ModelEntry, PublishedModel } from '../api/types'
import { addGroup, addObject, addShape, blankContent, newGroup, normalizeContent, publishFaults } from '../assets/Interfaces/admin/characters/modelContent'
import { newShape } from '../assets/Interfaces/admin/characters/engine/edit'
import { addRange, addScale, addTurn, attachGroup, newRange, recordPoints, reparent, type Edit } from '../assets/Interfaces/admin/characters/engine/rigEdit'
import { linkToEdge, makeTwin, setBack, setLoose } from '../assets/Interfaces/admin/characters/engine/pairEdit'
import { templateBox } from '../assets/Interfaces/admin/characters/engine/templates'

// A pretend character models API (`/api/character-models`), shared by the design system's previews (mockBackend.ts) and the tests
// (test/characterModelsBackend.ts): the catalog lives in memory and answers the way the server does -- drafts saved in order with their
// published copies kept, and publish, unpublish, discard and restore as whole-model operations. A route returns its status and JSON body.

export interface MockAnswer { status: number; body: unknown }
const ok = (body: unknown): MockAnswer => ({ status: 200, body })
const fail = (status: number, detail: string): MockAnswer => ({ status, body: { detail } })

const published = (version: number, c: ModelContent, at = '2026-01-12T09:00:00.000Z'): PublishedModel => ({ version, publishedAt: at, content: normalizeContent(c) })

// An entry that is published (its draft is what was published unless `over` says otherwise).
export function liveEntry(id: string, c: ModelContent, over: Partial<ModelEntry> = {}): ModelEntry {
  return { id, draft: c, published: published(1, c), history: [], nextVersion: 2, ...over }
}
export const draftEntry = (id: string, c: ModelContent): ModelEntry => ({ id, draft: c, published: null, history: [], nextVersion: 1 })
export const modelContent = (name: string, over: Partial<ModelContent> = {}): ModelContent => ({ ...blankContent(name), ...over })

export function createMockModels(initial: ModelEntry[]) {
  const state = { entries: structuredClone(initial) }
  const catalog = () => ({ schemaVersion: 1, models: structuredClone(state.entries) })

  // `parts` is the path after `/character-models`: [], ['published'], [id, 'publish'], [id, 'restore', '2'] ...
  function route(method: string, parts: string[], body: unknown): MockAnswer {
    if (parts.length === 0 && method === 'GET') return ok(catalog())
    if (parts.length === 0 && method === 'PUT') {
      const drafts = (body as { models: Array<{ id: string; draft: ModelContent }> }).models
      const byId = new Map(state.entries.map(e => [e.id, e]))
      state.entries = drafts.map(m => ({ ...(byId.get(m.id) ?? { id: m.id, published: null, history: [], nextVersion: 1 }), draft: normalizeContent(m.draft) }))
      return ok(catalog())
    }
    if (parts[0] === 'published' && method === 'GET') {
      return ok({ models: state.entries.filter(e => e.published).map(e => ({ id: e.id, version: e.published!.version, publishedAt: e.published!.publishedAt, content: e.published!.content })) })
    }
    if (parts.length >= 2 && method === 'POST') {
      const entry = state.entries.find(e => e.id === parts[0])
      if (!entry) return fail(404, 'no such model')
      if (parts[1] === 'publish') {
        const faults = publishFaults(entry.draft)
        if (faults.length) return fail(422, faults.join(' '))
        const taken = state.entries.find(o => o.id !== entry.id && o.published && o.published.content.name.toLowerCase() === entry.draft.name.toLowerCase())
        if (taken) return fail(422, `Another model is already published as '${taken.published!.content.name}'. Rename this one first.`)
        if (entry.published) entry.history = [entry.published, ...entry.history].slice(0, 10)
        entry.published = published(entry.nextVersion, entry.draft, new Date().toISOString())
        entry.nextVersion += 1
      } else if (parts[1] === 'unpublish') {
        if (!entry.published) return fail(409, 'The model is not published.')
        entry.history = [entry.published, ...entry.history].slice(0, 10)
        entry.published = null
      } else if (parts[1] === 'discard') {
        entry.draft = entry.published ? structuredClone(entry.published.content) : blankContent(entry.draft.name)
      } else if (parts[1] === 'restore') {
        const found = [entry.published, ...entry.history].find(v => v?.version === Number(parts[2]))
        if (!found) return fail(404, 'no such version')
        entry.draft = structuredClone(found.content)
      } else {
        return fail(404, 'Not found')
      }
      return ok(catalog())
    }
    return fail(404, 'Not found')
  }

  return { state, route }
}

// A small rigged figure for the previews: a torso (neck and chest) with a head hung from the neck's top edge, an arm hung from the chest and a forearm
// from the arm (and the arm's twin on the other side); sliders for the head's tilt and size, the arm's raise, the elbow, the shoulders' width (recorded
// point moves) and the height; a shirt whose points are locked to the chest's edge, with a slider for how loose it is; and a back outline for the head.
// Built with the same operations the Designer uses, so it is what a person would have made.
function riggedFigure(): ModelContent {
  const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
  const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
  let c = modelContent('Adult (basic)', { description: 'Lorem ipsum dolor sit amet, consectetur.' })
  for (const [id, name] of [['g_torso', 'Torso'], ['g_head', 'Head'], ['g_arm', 'Upper arm'], ['g_fore', 'Forearm']]) c = addGroup(c, newGroup(id, name))
  const parts: Array<[string, string, string, string, ReturnType<typeof box>, string]> = [
    ['g_torso', 'o_neck', 'Neck', 's_neck', box(92, 64, 16, 26), 'rounded'],
    ['g_torso', 'o_chest', 'Chest', 's_chest', box(70, 86, 60, 74), 'rounded'],
    ['g_head', 'o_head', 'Head', 's_head', box(80, 24, 40, 44), 'oval'],
    ['g_arm', 'o_arm', 'Upper arm', 's_arm', box(124, 90, 14, 50), 'rounded'],
    ['g_fore', 'o_fore', 'Forearm', 's_fore', box(125, 138, 12, 46), 'rounded'],
  ]
  for (const [g, o, name, sid, b, tpl] of parts) {
    c = addObject(c, g, { id: o, name, layer: 'body', shapes: [] })
    c = addShape(c, o, newShape(sid, name, tpl, b))
  }
  c = must(reparent(c, 'g_head', 'g_torso')); c = must(reparent(c, 'g_arm', 'g_torso')); c = must(reparent(c, 'g_fore', 'g_arm'))
  c = must(attachGroup(c, 'g_head', { shape: 's_neck', kind: 'edge', i: 0, t: 0.5, slider: null, rx: 0.5, ry: 0.5 }))
  c = must(attachGroup(c, 'g_arm', { shape: 's_chest', kind: 'inside', i: 0, t: 0, slider: null, rx: 1, ry: 0.1 }))
  c = must(attachGroup(c, 'g_fore', { shape: 's_arm', kind: 'inside', i: 0, t: 0, slider: null, rx: 0.5, ry: 1 }))
  const turn = (id: string, name: string, group: string, min: number, max: number, atMin: number, atMax: number) => {
    c = must(addRange(c, { ...newRange(id, name, 'turn', group), min, max }))
    c = must(addTurn(c, id, group))
    c = { ...c, ranges: c.ranges.map(r => (r.id === id ? { ...r, drives: r.drives.map(d => ({ ...d, atMin, atMax })) } : r)) }
  }
  turn('r_tilt', 'Head tilt', 'g_head', -20, 20, -12, 12)
  turn('r_raise', 'Arm raise', 'g_arm', -10, 95, 6, -95)
  turn('r_elbow', 'Elbow bend', 'g_fore', 0, 130, 0, -130)
  c = must(addRange(c, { ...newRange('r_head', 'Head size', 'scale', 'g_head'), min: 85, max: 125 }))
  c = must(addScale(c, 'r_head', 'group', 'g_head'))
  c = { ...c, ranges: c.ranges.map(r => (r.id === 'r_head' ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: 85, atMax: 125 })) } : r)) }
  c = must(addRange(c, { ...newRange('r_height', 'Height', 'scale', null), min: 70, max: 110 }))
  c = must(addScale(c, 'r_height', 'model'))
  c = { ...c, ranges: c.ranges.map(r => (r.id === 'r_height' ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: 70, atMax: 110 })) } : r)) }
  // shoulder width: the chest's top points move outward at the maximum and inward at the minimum
  c = must(addRange(c, { ...newRange('r_shoulders', 'Shoulder width', 'points', 's_chest'), min: 85, rest: 100, max: 120, unit: '%' }))
  const chest = c.shapes.find(x => x.id === 's_chest')!
  const moved = (at: Record<number, number>, sign: 1 | -1) => ({ ...chest, pts: chest.pts.map((p, i) => (at[i] ? { ...p, x: p.x + sign * at[i] } : p)) })
  c = must(recordPoints(c, 'r_shoulders', 's_chest', 'max', moved({ 0: -4, 1: 4, 2: 6, 3: 4, 6: -4, 7: -6 }, 1)))
  c = must(recordPoints(c, 'r_shoulders', 's_chest', 'min', moved({ 0: -4, 1: 4, 2: 6, 3: 4, 6: -4, 7: -6 }, -1)))
  // a shirt over the chest: every point locked to the chest's edge where it is drawn, so it follows the shoulders; a slider loosens or tightens it
  c = addGroup(c, newGroup('g_shirt', 'Clothes'))
  c = addObject(c, 'g_shirt', { id: 'o_shirt', name: 'Shirt', layer: 'clothing', shapes: [] })
  const shirt = newShape('s_shirt', 'Shirt', 'rounded', box(64, 82, 72, 84))
  c = addShape(c, 'o_shirt', shirt)
  shirt.pts.forEach((p, i) => { c = must(linkToEdge(c, 's_shirt', i, 's_chest', p.x, p.y)) })
  c = must(addRange(c, { ...newRange('r_fit', 'Shirt fit', 'scale', 's_shirt'), min: 0, rest: 100, max: 200, unit: '%' }))
  c = must(setLoose(c, ['s_shirt'], 'r_fit'))
  // the other arm: a twin of the arm and the forearm under it, which follows the arm's raise and elbow
  let n = 0
  c = must(makeTwin(c, 'group', 'g_arm', prefix => `${prefix}_twin${++n}`))
  // the hair side of the head is wider from behind: an outline of its own for the back view
  const head = c.shapes.find(x => x.id === 's_head')!, cx = 100, cy = 46
  c = must(setBack(c, 's_head', head.pts.map(p => ({ ...p, x: cx + (p.x - cx) * 1.12, y: cy + (p.y - cy) * 1.08, hi: p.hi ? [p.hi[0] * 1.12, p.hi[1] * 1.08] as [number, number] : p.hi, ho: p.ho ? [p.ho[0] * 1.12, p.ho[1] * 1.08] as [number, number] : p.ho }))))
  return c
}

// The catalog the design system's previews open with: the rigged figure (published as a simpler version, with changes since), and a blank model that
// was never published.
export function previewModels(): ModelEntry[] {
  const adult = riggedFigure()
  const plain = (shapeIds: string[]): ModelContent => {
    const shapes = adult.shapes.filter(s => shapeIds.includes(s.id))
    return { ...adult, shapes, objects: adult.objects.filter(o => o.shapes.every(s => shapeIds.includes(s)) && o.shapes.length), groups: [newGroup('g_head', 'Head', null, adult.objects.filter(o => o.shapes.every(s => shapeIds.includes(s))).map(o => o.id))], ranges: [] }
  }
  const live = liveEntry('adult', adult, { nextVersion: 3 })
  live.published = published(2, plain(['s_head', 's_neck', 's_chest']))
  live.history = [published(1, plain(['s_head']), '2026-01-05T09:00:00.000Z')]
  return [live, draftEntry('stylised', modelContent('Stylised (draft)', { description: 'Ut enim ad minim veniam.' }))]
}
