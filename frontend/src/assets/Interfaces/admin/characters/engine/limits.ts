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
  // the rig: a pivot chain of at most 6 groups (refused above it); sliders per model and what one slider drives
  chainMax: 6,
  rangesWarn: 40,
  rangesMax: 80,
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
  // how many of each a model may hold (the server's caps)
  shapesMax: 600,
  objectsMax: 200,
  groupsMax: 60,
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
  const presets = (content.presets ?? []).length
  add(level(presets, LIMITS.presetsWarn, LIMITS.presetsMax), `The model has ${presets} presets: the warning starts above ${LIMITS.presetsWarn}.`, `The model has ${presets} presets: the limit is ${LIMITS.presetsMax}.`)
  const links = linkCount(content)
  if (links > LIMITS.linksWarn) notes.push({ level: links > LIMITS.linksMax ? 'stop' : 'warn', text: links > LIMITS.linksMax ? `The model has ${links} point links: the limit is ${LIMITS.linksMax}, so it cannot be published.` : `The model has ${links} point links: the warning starts above ${LIMITS.linksWarn}.` })
  for (const g of content.groups) {
    const depth = chainDepth(content, g.id), name = g.name || g.id
    if (depth > LIMITS.chainMax) notes.push({ level: 'stop', text: `${name} is ${depth} levels deep: a pivot chain may have at most ${LIMITS.chainMax}, so it cannot be published.` })
    else if (depth === LIMITS.chainMax) notes.push({ level: 'warn', text: `${name} is ${depth} levels deep, the most a pivot chain may have.` })
  }
  const bytes = copyBytes(content)
  const kb = Math.round(bytes / 102.4) / 10
  add(bytes >= LIMITS.copyMaxBytes ? 'stop' : bytes > LIMITS.copyWarnBytes ? 'warn' : 'ok',
    `A character's copy of this model is ${kb} KB: the warning starts above ${LIMITS.copyWarnBytes / 1024} KB.`,
    `A character's copy of this model is ${kb} KB: the limit is ${LIMITS.copyMaxBytes / 1024} KB, so it cannot be published.`)
  return notes
}
