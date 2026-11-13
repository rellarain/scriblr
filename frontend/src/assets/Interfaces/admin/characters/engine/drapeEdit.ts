import type { ModelContent, ModelObject } from '../../../../../api/types'
import { done, fail, type Edit } from './rigEdit'

// Drape (phase O6): how far, in percent, an object's weighted points hang back toward the way they were drawn when the body moves (the hem of a coat or a skirt keeps
// hanging when the hips tilt). The points that hang are the ones with a weight (the Weights tool); the rest follow the body. A twin follows its original.

export const DRAPE_STEP = 10
export const DRAPE_BIG = 25

// The drape an object is drawn with: its own, or its original's for a twin.
export function drapeOf(c: ModelContent, o: ModelObject): number {
  const from = o.mirrorOf ? c.objects.find(x => x.id === o.mirrorOf) ?? o : o
  const v = from.drape ?? 0
  return Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : 0
}

// Whether any shape of the object has a point with a weight (something that can hang).
export function hasWeights(c: ModelContent, o: ModelObject): boolean {
  const from = o.mirrorOf ? c.objects.find(x => x.id === o.mirrorOf) ?? o : o
  return from.shapes.some(id => c.shapes.find(s => s.id === id)?.pts.some(p => (p.w ?? 0) > 0))
}

// The drape one step up or down (Shift: a bigger step), held between none and all of it.
export function stepDrape(c: ModelContent, objectId: string, dir: -1 | 1, big = false): Edit {
  const o = c.objects.find(x => x.id === objectId)
  if (!o) return fail('There is no such object.')
  if (o.mirrorOf) return fail('A twin follows its original: set the drape on the original.')
  const next = Math.min(100, Math.max(0, drapeOf(c, o) + dir * (big ? DRAPE_BIG : DRAPE_STEP)))
  return done({ ...c, objects: c.objects.map(x => (x.id === objectId ? { ...x, drape: next } : x)) })
}
