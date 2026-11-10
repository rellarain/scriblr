import type { ModelContent, ModelEntry, PublishedModel } from '../api/types'
import { addGroup, addObject, addShape, blankContent, newGroup, normalizeContent, objectById, publishFaults, renameObject, updateShape } from '../assets/Interfaces/admin/characters/modelContent'
import { newShape } from '../assets/Interfaces/admin/characters/engine/edit'
import { addGrip, addHand, addHandPoses, apartHand, mirrorGrip, renameGrip, setPresetGrip } from '../assets/Interfaces/admin/characters/engine/hands'
import { apartSlider } from '../assets/Interfaces/admin/characters/engine/sidesEdit'
import { addLength, addRange, addScale, addTurn, attachGroup, newRange, recordPoints, reparent, type Edit } from '../assets/Interfaces/admin/characters/engine/rigEdit'
import { addBone, setHeadBone } from '../assets/Interfaces/admin/characters/engine/bones'
import { setFit } from '../assets/Interfaces/admin/characters/engine/fitEdit'
import { addFrame, toggleFrameHide } from '../assets/Interfaces/admin/characters/engine/frames'
import { bridgeBetween, spotFromClick } from '../assets/Interfaces/admin/characters/engine/bridgeEdit'
import { setFade } from '../assets/Interfaces/admin/characters/engine/fadeEdit'
import { addFall, withWeight } from '../assets/Interfaces/admin/characters/engine/fallEdit'
import { addAxis, addForm, renameForm, setOverride } from '../assets/Interfaces/admin/characters/engine/formEdit'
import { addMember, makeClass } from '../assets/Interfaces/admin/characters/engine/classEdit'
import { classKey, formKey } from '../assets/Interfaces/admin/characters/engine/forms'
import { linkToEdge, makeTwin, setBack, setLoose } from '../assets/Interfaces/admin/characters/engine/pairEdit'
import { setBlend, setGradient, toggleCut } from '../assets/Interfaces/admin/characters/engine/paintEdit'
import { addShading } from '../assets/Interfaces/admin/characters/engine/shadeEdit'
import { setObjectLock, setStyleLock } from '../assets/Interfaces/admin/characters/engine/locks'
import { saveStyle, savePreset } from '../assets/Interfaces/admin/characters/engine/presets'
import { templateBox } from '../assets/Interfaces/admin/characters/engine/templates'
import { standardGenres, standardSlots, starterPalette } from '../assets/Interfaces/admin/characters/engine/standardColours'

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
// point moves) and the height; a shirt whose points are locked to the chest's edge, with a slider for how loose it is; a back outline for the head; forms
// (the head is Oval, Square or Long; the sleeve is Short, Long or none), a family of eyes (Almond, Round, Hooded: members of one pattern, each with its twin on
// the other side of the face and its own choice of lids) and presets (poses, an expression, a build, outfits, and a style of the head). Built with the same
// operations the Designer uses, so it is what a person would have made.
function riggedFigure(): ModelContent {
  const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
  const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
  let c = modelContent('Adult (basic)', { description: 'Lorem ipsum dolor sit amet, consectetur.', genres: standardGenres(), palette: starterPalette(), slots: standardSlots() })
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
    c = addShape(c, o, { ...newShape(sid, name, tpl, b), slot: 'k_skin' })
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
  turn('r_raise', 'Arm raise', 'g_arm', -10, 70, 6, -70)       // (not higher: with a hand on it, the arm held out sideways would leave the picture)
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
  const shirt = { ...newShape('s_shirt', 'Shirt', 'rounded', box(64, 82, 72, 84)), slot: 'k_cloth' }
  c = addShape(c, 'o_shirt', shirt)
  shirt.pts.forEach((p, i) => { c = must(linkToEdge(c, 's_shirt', i, 's_chest', p.x, p.y)) })
  c = must(addRange(c, { ...newRange('r_fit', 'Shirt fit', 'scale', 's_shirt'), min: 0, rest: 100, max: 200, unit: '%' }))
  c = must(setLoose(c, ['s_shirt'], 'r_fit'))
  // paint effects: a neckline (a helper shape, never drawn) cuts a hole in the shirt, a shadow band along its right edge is multiplied with what is under it, and a
  // highlight lies along the left of the head
  c = addShape(c, 'o_shirt', { ...newShape('s_neckline', 'Neckline', 'oval', box(88, 78, 24, 14)), slot: 'k_cloth', helper: true })
  c = must(toggleCut(c, 's_shirt', 's_neckline'))
  let paintIds = 0
  const mkPaint = (prefix: string) => `${prefix}_paint${++paintIds}`
  const shirtShade = addShading(c, 's_shirt', 'shadow', 'right', mkPaint)
  c = must(shirtShade)
  c = must(setBlend(c, shirtShade.shapeId!, 'multiply'))
  c = must(addShading(c, 's_head', 'highlight', 'left', mkPaint))
  // a sleeve on the upper arm, short unless a form of the arm says otherwise
  c = addShape(c, 'o_arm', { ...newShape('s_sleeve', 'Sleeve', 'rounded', box(122, 88, 18, 28)), slot: 'k_cloth' })
  // (the body is painted from Skin, the shirt and sleeve from Clothing, the iris from Eye, the white of the eye a fixed white)
  // a hand on the forearm: a palm, four fingers of three joints and a thumb on the side of the palm, with their sliders (a Curl for each finger and the thumb,
  // the Spread of the fingers, the thumb's Swing and Across)
  let nh = 0
  const hand = addHand(c, 'g_fore', {}, prefix => `${prefix}_hand${++nh}`)
  c = must(hand)
  const palm = hand.hand!.palm
  // the other arm: a twin of the arm and the forearm under it (and the hand), mirrored from the original; the two arms and the two hands are posed apart, each
  // with a slider of its own, while the drawing stays mirrored
  let n = 0
  c = must(makeTwin(c, 'group', 'g_arm', prefix => `${prefix}_twin${++n}`))
  let ns = 0
  const mkSide = (prefix: string) => `${prefix}_side${++ns}`
  for (const id of ['r_raise', 'r_elbow']) c = must(apartSlider(c, id, mkSide))
  c = must(apartHand(c, palm, mkSide))
  // the hair side of the head is wider from behind: an outline of its own for the back view
  const head = c.shapes.find(x => x.id === 's_head')!, cx = 100, cy = 46
  c = must(setBack(c, 's_head', head.pts.map(p => ({ ...p, x: cx + (p.x - cx) * 1.12, y: cy + (p.y - cy) * 1.08, hi: p.hi ? [p.hi[0] * 1.12, p.hi[1] * 1.08] as [number, number] : p.hi, ho: p.ho ? [p.ho[0] * 1.12, p.ho[1] * 1.08] as [number, number] : p.ho }))))
  // forms: the head is Oval (its base outline), Square or Long; the arm's sleeve is Short (its base outline), Long (an outline of its own) or gone
  let f = 0
  const mk = (prefix: string) => `${prefix}_form${++f}`
  const axisWith = (objectId: string, axisName: string, firstName: string) => {
    const made = addAxis(c, objectId, axisName, mk)
    c = must(made)
    c = renameForm(c, objectId, made.axisId!, made.formId!, firstName)
    return made.axisId!
  }
  const formWith = (objectId: string, axisId: string, name: string, shapeId: string, pts: ModelContent['shapes'][number]['pts'] | null) => {
    const made = addForm(c, objectId, axisId, {}, name, mk)
    c = must(made)
    c = must(setOverride(c, objectId, axisId, made.formId!, shapeId, pts ?? []))
  }
  const headShape = axisWith('o_head', 'Head shape', 'Oval')
  formWith('o_head', headShape, 'Square', 's_head', newShape('x', 'Head', 'rounded', box(80, 26, 40, 40)).pts)
  formWith('o_head', headShape, 'Long', 's_head', newShape('x', 'Head', 'oval', box(83, 18, 34, 54)).pts)
  const sleeve = axisWith('o_arm', 'Sleeve', 'Short')
  formWith('o_arm', sleeve, 'Long', 's_sleeve', newShape('x', 'Sleeve', 'rounded', box(122, 88, 18, 52)).pts)
  formWith('o_arm', sleeve, 'None', 's_sleeve', null)
  // eyes: one pattern (the white and the iris, with an axis of lids that each member chooses on its own) and three members of the family -- Almond follows the
  // pattern, Round and Hooded give a shape an outline of their own -- each with its twin on the other side of the face; the head shows one of them at a time
  c = addObject(c, 'g_head', { id: 'o_eye', name: 'Eye', layer: 'body', shapes: [] })
  c = addShape(c, 'o_eye', { ...newShape('s_eye', 'White', 'oval', box(85, 41, 11, 7)), gray: 100 })
  c = addShape(c, 'o_eye', { ...newShape('s_iris', 'Iris', 'oval', box(88.5, 41.5, 5, 5)), slot: 'k_eye' })
  c = must(setGradient(c, 's_iris', { dir: 'radial', to: null }))   // every member of the family follows it
  const lids = axisWith('o_eye', 'Lids', 'Open')
  formWith('o_eye', lids, 'Closed', 's_iris', null)
  const family = makeClass(c, 'o_eye', 'Eye', true, mk)
  c = must(family)
  const memberIds: Record<string, string> = {}
  for (const name of ['Almond', 'Round', 'Hooded']) {
    const made = addMember(c, family.classId!, mk)
    c = must(made)
    c = renameObject(c, made.memberId!, name)
    memberIds[name] = made.memberId!
  }
  const ownOutline = (member: string, followed: string, b: ReturnType<typeof box>) => {
    const mine = objectById(c, memberIds[member])!.shapes.find(id => c.shapes.find(x => x.id === id)?.copyOf === followed)!
    c = updateShape(c, mine, sh => ({ ...sh, pts: newShape('x', sh.name, 'oval', b).pts }))
  }
  ownOutline('Round', 's_eye', box(85, 40, 11, 9))
  ownOutline('Hooded', 's_eye', box(85, 43, 11, 4))
  ownOutline('Hooded', 's_iris', box(89, 43, 4, 4))
  for (const name of Object.keys(memberIds)) c = must(makeTwin(c, 'object', memberIds[name], mk))
  // a bridge of skin across the elbow, locked to the edges of the upper arm and the forearm (it is built on the left arm and the right one gets its twin), and a
  // crease in the bend that shows as the elbow does (the shading band along the top of the forearm, faint until the elbow is bent)
  const bridge = bridgeBetween(c, [
    spotFromClick(c, 's_arm', 124, 132)!, spotFromClick(c, 's_fore', 125, 146)!, spotFromClick(c, 's_fore', 137, 146)!, spotFromClick(c, 's_arm', 138, 132)!,
  ], mkPaint)
  c = must(bridge)
  const crease = addShading(c, 's_fore', 'shadow', 'top', mkPaint)
  c = must(crease)
  c = must(setFade(c, crease.shapeId!, 'r_elbow'))
  c = { ...c, shapes: c.shapes.map(x => (x.id === crease.shapeId ? { ...x, name: 'Crease of the elbow', opBy: { slider: 'r_elbow', hidden: 8, shown: 110 } } : x)) }
  // a ponytail on the head: it sticks out sideways at rest, and the weighted points hang under their own weight as the Hair fall slider rises (to the side the
  // test character is turned to: down, the picture's left or right, behind)
  c = addObject(c, 'g_head', { id: 'o_hair', name: 'Ponytail', layer: 'hair', shapes: [] })
  const lock = [[118, 36, 0], [134, 31, 0.5], [150, 35, 1], [150, 45, 1], [134, 43, 0.5], [118, 44, 0]] as const
  c = addShape(c, 'o_hair', {
    id: 's_lock', name: 'Ponytail', closed: true, z: 35, op: 1, view: 'both', half: 0, template: null, slot: 'k_hair',
    pts: lock.map(([x, y, w]) => withWeight({ x, y, m: 'c' as const, hi: null, ho: null }, w)),
  })
  c = must(addRange(c, { ...newRange('r_fall', 'Hair fall', 'fall', 's_lock'), min: 0, rest: 0, max: 100, unit: '%' }))
  c = must(addFall(c, 'r_fall', 's_lock'))
  // presets: a pose replaces the last pose, an expression leaves the arms alone, an outfit switches the shirt off or on
  const preset = (name: string, kind: string, values: Record<string, number>, hidden: string[] = [], fall?: 'down' | 'left' | 'right' | 'behind') => { c = must(savePreset(c, { values, forms: {}, hidden, fall }, name, kind, mk)) }
  preset('At rest', 'Pose', {})
  preset('Wave', 'Pose', { r_raise: 65, r_elbow: 50 })
  preset('Curious', 'Expression', { r_tilt: 12 })
  preset('Broad', 'Build', { r_shoulders: 118 })
  preset('Shirt on', 'Outfit', {})
  preset('No shirt', 'Outfit', {}, ['o_shirt'])
  preset('Calm', 'Weather', {})
  preset('Windswept', 'Weather', { r_fall: 100 }, [], 'left')
  // a style of the head: the hooded eye with closed lids and the head turned a little (it belongs to the Head group, and is listed with the presets)
  const closed = objectById(c, 'o_eye')!.axes![0].options.find(f => f.name === 'Closed')!.id
  c = must(saveStyle(c, { values: { r_tilt: -8 }, forms: { [classKey(family.classId!)]: memberIds.Hooded, [formKey(memberIds.Hooded, lids)]: closed }, hidden: [] }, 'g_head', 'Sleepy', 'Style', mk))
  // a style of the shirt that holds the lightness of its colour low while it is on, and the saturation the shirt always keeps (so clothes stay in muted tones whatever swatch
  // is chosen); the Elder variant below turns that style on and picks gray hair
  const darkShirt = saveStyle(c, { values: {}, forms: {}, hidden: [] }, 'o_shirt', 'Dark', 'Style', prefix => `${prefix}_dark`)   // an id of its own, so the other ids are as they were
  if (!darkShirt.ok || !darkShirt.presetId) throw new Error('The sample shirt style could not be made')
  c = must(setStyleLock(darkShirt.content, darkShirt.presetId, 'k_cloth', 'l', 18))
  c = must(setObjectLock(c, 'o_shirt', 'k_cloth', 's', 35))

  // proportions: bones along the head (to the top of the skull, the unit for head heights), the upper arm and the forearm; a Length slider for each arm bone (the
  // other arm follows); the span a writer may choose for the sliders that change the body's proportions; Age and Build presets over them; the eyes keep their
  // size when the head grows
  let nb = 0
  const mkBone = (prefix: string) => `${prefix}_bone${++nb}`
  const extreme = (shapeId: string, bottom: boolean) => c.shapes.find(x => x.id === shapeId)!.pts.reduce((best, pt, i, all) => ((bottom ? pt.y > all[best].y : pt.y < all[best].y) ? i : best), 0)
  c = must(addBone(c, 'g_head', { kind: 'point', id: 's_head', i: extreme('s_head', false) }, 'Head', mkBone))
  c = must(addBone(c, 'g_arm', { kind: 'group', id: 'g_fore', i: 0 }, 'Upper arm', mkBone))
  c = must(addBone(c, 'g_fore', { kind: 'point', id: 's_fore', i: extreme('s_fore', true) }, 'Forearm', mkBone))
  const [headBone, upperBone, foreBone] = c.bones!.map(x => x.id)
  c = must(setHeadBone(c, headBone))
  for (const [id, name, group, bone] of [['r_arm_len', 'Upper arm length', 'g_arm', upperBone], ['r_fore_len', 'Forearm length', 'g_fore', foreBone]] as const) {
    c = must(addRange(c, { ...newRange(id, name, 'length', group), min: 85, rest: 100, max: 120 }))
    c = must(addLength(c, id, bone))
    c = { ...c, ranges: c.ranges.map(r => (r.id === id ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: 85, atMax: 120 })) } : r)) }
  }
  const limits: Record<string, [number, number]> = { r_height: [80, 105], r_head: [90, 115], r_shoulders: [90, 118], r_arm_len: [90, 115], r_fore_len: [90, 115] }
  c = { ...c, ranges: c.ranges.map(r => (limits[r.id] ? { ...r, limit: limits[r.id] } : r)) }
  preset('Infant', 'Age', { r_height: 80, r_head: 115, r_arm_len: 90, r_fore_len: 90, r_shoulders: 90 })
  preset('Child', 'Age', { r_height: 88, r_head: 110, r_arm_len: 94, r_fore_len: 94, r_shoulders: 94 })
  preset('Teen', 'Age', { r_height: 97, r_head: 104, r_arm_len: 98, r_fore_len: 98, r_shoulders: 98 })
  preset('Adult', 'Age', {})
  preset('Elder', 'Age', { r_height: 94, r_head: 102 })
  c = { ...c, presets: c.presets!.map(p => (p.name === 'Elder' && p.kind === 'Age' ? { ...p, styles: { o_shirt: darkShirt.presetId! }, picks: { k_hair: 'c_hair_11' } } : p)) }
  preset('Slim', 'Build', { r_shoulders: 92 })
  preset('Average', 'Build', {})
  preset('Heavy', 'Build', { r_shoulders: 118, r_fit: 130 })
  // the starter hand poses (a kind for each hand, so each takes its own), and a grip point in the middle of each hand that the Grip pose holds with
  c = must(addHandPoses(c, palm, mk))
  let ng = 0
  const mkGrip = (prefix: string) => `${prefix}_grip${++ng}`
  const grip = addGrip(c, palm, mkGrip)
  c = renameGrip(must(grip), grip.gripId!, 'Staff grip')
  const otherGrip = mirrorGrip(c, grip.gripId!, mkGrip)
  c = must(otherGrip)
  for (const [kind, id] of [['Hand', grip.gripId!], ['Hand (other side)', otherGrip.gripId!]] as const) c = must(setPresetGrip(c, c.presets!.find(p => p.kind === kind && p.name === 'Grip')!.id, id))
  for (const name of Object.keys(memberIds)) c = must(setFit(c, memberIds[name], 'keep'))

  // frames: the figure from head to hands, a bust and the face (which leaves out the arms and the shirt)
  let nf = 0
  const mkFrame = (prefix: string) => `${prefix}_frame${++nf}`
  c = must(addFrame(c, { x: 30, y: 10, w: 140, h: 215 }, 'Head to hands', mkFrame))
  c = must(addFrame(c, { x: 50, y: 14, w: 100, h: 96 }, 'Bust', mkFrame))
  const face = addFrame(c, { x: 72, y: 16, w: 56, h: 60 }, 'Face', mkFrame)
  c = must(face)
  for (const thing of ['g_arm', c.groups.find(g => g.mirrorOf === 'g_arm')!.id, 'g_shirt']) c = must(toggleFrameHide(c, face.frameId!, thing))
  return c
}

// The catalog the design system's previews open with: the rigged figure (published as a simpler version, with changes since), and a blank model that
// was never published.
export function previewModels(): ModelEntry[] {
  const adult = riggedFigure()
  const plain = (shapeIds: string[]): ModelContent => {
    const shapes = adult.shapes.filter(s => shapeIds.includes(s.id)).map(s => ({ ...s, cut: [], clip: null }))
    const objects = adult.objects.map(o => ({ ...o, shapes: o.shapes.filter(s => shapeIds.includes(s)), axes: [] })).filter(o => o.shapes.length)
    return { ...adult, shapes, objects, presets: [], classes: [], groups: [newGroup('g_head', 'Head', null, objects.map(o => o.id))], ranges: [], bones: [], headBone: null, frames: [], grips: [] }
  }
  const live = liveEntry('adult', adult, { nextVersion: 3 })
  live.published = published(2, plain(['s_head', 's_neck', 's_chest']))
  live.history = [published(1, plain(['s_head']), '2026-01-05T09:00:00.000Z')]
  return [live, draftEntry('stylised', modelContent('Stylised (draft)', { description: 'Ut enim ad minim veniam.' }))]
}
