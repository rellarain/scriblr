import type { ModelContent, ModelShape } from '../../../../../api/types'
import { chainDepth } from './rig'

// The limits the user chose (the same numbers as backend schema.py "Character models"): a warning above the first, a stop at the second.
export const LIMITS = {
  pointsWarn: 24,
  pointsMax: 60,
  objectsPerGroupWarn: 24,
  objectsPerGroupMax: 48,
  shapesPerObjectWarn: 36,
  shapesPerObjectMax: 72,
  copyWarnBytes: 150 * 1024,
  copyMaxBytes: 250 * 1024,
  // the rig: a pivot chain of at most 9 groups (refused above it, a warning above 6: torso, arm, forearm, hand and three finger joints is 7); sliders per model and what one slider drives
  chainWarn: 6,
  chainMax: 9,
  rangesWarn: 60,
  rangesMax: 120,
  drivesWarn: 12,
  drivesMax: 24,
  // point links (a point welded to, following or locked to the edge of another shape), counted over the whole model; more than the most is refused at Publish
  linksWarn: 100,
  linksMax: 200,
  // forms: axes per object, forms per axis, presets per model (the stops are the server's max_lengths)
  axesWarn: 4,
  axesMax: 8,
  formsWarn: 24,
  formsMax: 48,
  presetsWarn: 40,
  presetsMax: 80,
  // classes: per model, members per class, form choices one style keeps
  classesWarn: 12,
  classesMax: 24,
  membersWarn: 12,
  membersMax: 24,
  presetFormsMax: 100,
  // group states (phase D3b): state axes per group, options per state axis (the stops are the server's max_lengths)
  statesWarn: 4,
  statesMax: 8,
  stateOptionsWarn: 8,
  stateOptionsMax: 24,
  // colour: genre tags per model, colour slots per model, default colours per slot, swatches of the starter palette (the stops are the server's max_lengths)
  genresWarn: 8,
  genresMax: 12,
  slotsWarn: 16,
  slotsMax: 32,
  coloursWarn: 40,
  coloursMax: 64,
  paletteMax: 10,
  // paint effects: shading shapes per object (twins are not counted), cut-outs per shape, paint changes one form may make (the stops are the server's max_lengths and publish faults)
  shadesWarn: 8,
  shadesMax: 10,
  cutsMax: 8,
  looksMax: 72,
  // proportions and frames: bones per model, frames per model, what a frame may hide (the stops are the server's max_lengths)
  bonesWarn: 12,
  bonesMax: 24,
  framesWarn: 8,
  framesMax: 16,
  frameHideMax: 100,
  // hands: grip points per model (the stops are the server's max_lengths)
  gripsWarn: 8,
  gripsMax: 16,
  // how many of each a model may hold (the server's caps)
  shapesMax: 600,
  objectsMax: 200,
  groupsMax: 120,
} as const

export type LimitLevel = 'ok' | 'warn' | 'stop'

export function level(count: number, warn: number, max: number): LimitLevel {
  return count >= max ? 'stop' : count > warn ? 'warn' : 'ok'
}

export const pointLevel = (shape: Pick<ModelShape, 'pts'>): LimitLevel => level(shape.pts.length, LIMITS.pointsWarn, LIMITS.pointsMax)
export const canAddPoint = (shape: Pick<ModelShape, 'pts'>): boolean => shape.pts.length < LIMITS.pointsMax

// The size of a character's copy of a model, in bytes: its compact JSON (what the backend counts).
export function copyBytes(content: ModelContent): number {
  return new TextEncoder().encode(JSON.stringify(content)).length
}

// How many point links the model has (every point of every shape that is linked to another shape).
export const linkCount = (content: ModelContent): number => content.shapes.reduce((n, s) => n + s.pts.filter(p => p.bind).length, 0)

// How many shading shapes an object has (a twin follows its original and is not counted).
export function shadingCount(content: ModelContent, objectId: string): number {
  const o = content.objects.find(x => x.id === objectId)
  if (!o) return 0
  const shapes = new Map(content.shapes.map(s => [s.id, s]))
  return o.shapes.filter(id => { const s = shapes.get(id); return !!s && !!s.shade && !s.mirrorOf }).length
}

export interface LimitNote { level: 'warn' | 'stop'; text: string }

// Every limit the content is at or past, in plain words (the Check panel and the inspector show these).
export function limitNotes(content: ModelContent): LimitNote[] {
  const notes: LimitNote[] = []
  const add = (lv: LimitLevel, warn: string, stop: string) => { if (lv !== 'ok') notes.push({ level: lv, text: lv === 'stop' ? stop : warn }) }
  for (const s of content.shapes) {
    const name = s.name || s.id
    add(pointLevel(s), `${name} has ${s.pts.length} points: the warning starts above ${LIMITS.pointsWarn}.`, `${name} has ${s.pts.length} points: the limit is ${LIMITS.pointsMax}.`)
  }
  for (const o of content.objects) {
    const name = o.name || o.id
    add(level(o.shapes.length, LIMITS.shapesPerObjectWarn, LIMITS.shapesPerObjectMax), `${name} has ${o.shapes.length} shapes: the warning starts above ${LIMITS.shapesPerObjectWarn}.`, `${name} has ${o.shapes.length} shapes: the limit is ${LIMITS.shapesPerObjectMax}.`)
  }
  for (const g of content.groups) {
    const name = g.name || g.id
    add(level(g.objects.length, LIMITS.objectsPerGroupWarn, LIMITS.objectsPerGroupMax), `${name} has ${g.objects.length} objects: the warning starts above ${LIMITS.objectsPerGroupWarn}.`, `${name} has ${g.objects.length} objects: the limit is ${LIMITS.objectsPerGroupMax}.`)
  }
  add(level(content.ranges.length, LIMITS.rangesWarn, LIMITS.rangesMax), `The model has ${content.ranges.length} sliders: the warning starts above ${LIMITS.rangesWarn}.`, `The model has ${content.ranges.length} sliders: the limit is ${LIMITS.rangesMax}.`)
  for (const r of content.ranges) {
    const name = r.name || r.id
    add(level(r.drives.length, LIMITS.drivesWarn, LIMITS.drivesMax), `${name} drives ${r.drives.length} things: the warning starts above ${LIMITS.drivesWarn}.`, `${name} drives ${r.drives.length} things: the limit is ${LIMITS.drivesMax}.`)
  }
  for (const o of content.objects) {
    const name = o.name || o.id, axes = o.axes ?? []
    add(level(axes.length, LIMITS.axesWarn, LIMITS.axesMax), `${name} has ${axes.length} axes of forms: the warning starts above ${LIMITS.axesWarn}.`, `${name} has ${axes.length} axes of forms: the limit is ${LIMITS.axesMax}.`)
    for (const a of axes) add(level(a.options.length, LIMITS.formsWarn, LIMITS.formsMax), `${a.name || a.id} of ${name} has ${a.options.length} forms: the warning starts above ${LIMITS.formsWarn}.`, `${a.name || a.id} of ${name} has ${a.options.length} forms: the limit is ${LIMITS.formsMax}.`)
  }
  for (const g of content.groups) {
    const name = g.name || g.id, states = g.states ?? []
    add(level(states.length, LIMITS.statesWarn, LIMITS.statesMax), `${name} has ${states.length} states: the warning starts above ${LIMITS.statesWarn}.`, `${name} has ${states.length} states: the limit is ${LIMITS.statesMax}.`)
    for (const st of states) add(level(st.options.length, LIMITS.stateOptionsWarn, LIMITS.stateOptionsMax), `${st.name || st.id} of ${name} has ${st.options.length} options: the warning starts above ${LIMITS.stateOptionsWarn}.`, `${st.name || st.id} of ${name} has ${st.options.length} options: the limit is ${LIMITS.stateOptionsMax}.`)
  }
  const presets = (content.presets ?? []).length
  add(level(presets, LIMITS.presetsWarn, LIMITS.presetsMax), `The model has ${presets} presets: the warning starts above ${LIMITS.presetsWarn}.`, `The model has ${presets} presets: the limit is ${LIMITS.presetsMax}.`)
  const classes = (content.classes ?? []).length
  add(level(classes, LIMITS.classesWarn, LIMITS.classesMax), `The model has ${classes} classes: the warning starts above ${LIMITS.classesWarn}.`, `The model has ${classes} classes: the limit is ${LIMITS.classesMax}.`)
  for (const k of content.classes ?? []) {
    const members = content.objects.filter(o => o.classOf === k.id).length
    add(level(members, LIMITS.membersWarn, LIMITS.membersMax), `Class ${k.name || k.id} has ${members} members: the warning starts above ${LIMITS.membersWarn}.`, `Class ${k.name || k.id} has ${members} members: the limit is ${LIMITS.membersMax}.`)
  }
  const slots = content.slots ?? []
  add(level(slots.length, LIMITS.slotsWarn, LIMITS.slotsMax), `The model has ${slots.length} colour slots: the warning starts above ${LIMITS.slotsWarn}.`, `The model has ${slots.length} colour slots: the limit is ${LIMITS.slotsMax}.`)
  for (const sl of slots) add(level(sl.colours.length, LIMITS.coloursWarn, LIMITS.coloursMax), `${sl.name || sl.id} has ${sl.colours.length} default colours: the warning starts above ${LIMITS.coloursWarn}.`, `${sl.name || sl.id} has ${sl.colours.length} default colours: the limit is ${LIMITS.coloursMax}.`)
  const genres = (content.genres ?? []).length
  add(level(genres, LIMITS.genresWarn, LIMITS.genresMax), `The model has ${genres} genres: the warning starts above ${LIMITS.genresWarn}.`, `The model has ${genres} genres: the limit is ${LIMITS.genresMax}.`)
  for (const o of content.objects) {
    const shading = shadingCount(content, o.id)
    add(level(shading, LIMITS.shadesWarn, LIMITS.shadesMax), `${o.name || o.id} has ${shading} shading shapes: the warning starts above ${LIMITS.shadesWarn}.`, `${o.name || o.id} has ${shading} shading shapes: the limit is ${LIMITS.shadesMax}.`)
  }
  const bones = (content.bones ?? []).length
  add(level(bones, LIMITS.bonesWarn, LIMITS.bonesMax), `The model has ${bones} bones: the warning starts above ${LIMITS.bonesWarn}.`, `The model has ${bones} bones: the limit is ${LIMITS.bonesMax}.`)
  const grips = (content.grips ?? []).length
  add(level(grips, LIMITS.gripsWarn, LIMITS.gripsMax), `The model has ${grips} grip points: the warning starts above ${LIMITS.gripsWarn}.`, `The model has ${grips} grip points: the limit is ${LIMITS.gripsMax}.`)
  const frames = (content.frames ?? []).length
  add(level(frames, LIMITS.framesWarn, LIMITS.framesMax), `The model has ${frames} frames: the warning starts above ${LIMITS.framesWarn}.`, `The model has ${frames} frames: the limit is ${LIMITS.framesMax}.`)
  const links = linkCount(content)
  if (links > LIMITS.linksWarn) notes.push({ level: links > LIMITS.linksMax ? 'stop' : 'warn', text: links > LIMITS.linksMax ? `The model has ${links} point links: the limit is ${LIMITS.linksMax}, so it cannot be published.` : `The model has ${links} point links: the warning starts above ${LIMITS.linksWarn}.` })
  // a chain too long is named group by group; more than a few that are deep (the fingers of a hand) are said once, with the deepest
  const deep: Array<{ name: string; depth: number }> = []
  for (const g of content.groups) {
    const depth = chainDepth(content, g.id), name = g.name || g.id
    if (depth > LIMITS.chainMax) notes.push({ level: 'stop', text: `${name} is ${depth} levels deep: a pivot chain may have at most ${LIMITS.chainMax}, so it cannot be published.` })
    else if (depth > LIMITS.chainWarn) deep.push({ name, depth })
  }
  if (deep.length <= 3) for (const d of deep) notes.push({ level: 'warn', text: `${d.name} is ${d.depth} levels deep: the warning starts above ${LIMITS.chainWarn} (the most is ${LIMITS.chainMax}).` })
  else {
    const deepest = deep.reduce((a, b) => (b.depth > a.depth ? b : a))
    notes.push({ level: 'warn', text: `${deep.length} groups are more than ${LIMITS.chainWarn} levels deep (the deepest is ${deepest.name}, ${deepest.depth} levels): the warning starts above ${LIMITS.chainWarn} (the most is ${LIMITS.chainMax}).` })
  }
  const bytes = copyBytes(content)
  const kb = Math.round(bytes / 102.4) / 10
  add(bytes >= LIMITS.copyMaxBytes ? 'stop' : bytes > LIMITS.copyWarnBytes ? 'warn' : 'ok',
    `A character's copy of this model is ${kb} KB: the warning starts above ${LIMITS.copyWarnBytes / 1024} KB.`,
    `A character's copy of this model is ${kb} KB: the limit is ${LIMITS.copyMaxBytes / 1024} KB, so it cannot be published.`)
  return notes
}
