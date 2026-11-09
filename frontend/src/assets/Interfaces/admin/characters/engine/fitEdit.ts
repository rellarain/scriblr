import type { ModelContent, ModelFit, ModelObject } from '../../../../../api/types'
import { done, fail, type Edit } from './rigEdit'

// How an object fits the body (phase 5a). 'scale' (the default): it moves, turns and scales with its group. 'keep': it moves and turns with its group but keeps
// its own size. 'stretch': it follows the box of another shape, growing and moving as that box does. Only the drawing changes: anchors and links read the
// outline as the group holds it. These operations return new content (or why they cannot) and leave the content they were given alone.

export const FIT_NAMES: Record<ModelFit, string> = { scale: 'Scales with its group', keep: 'Keeps its size', stretch: 'Stretches to a shape' }
export const FIT_MODES: ModelFit[] = ['scale', 'keep', 'stretch']

export const fitOf = (o: Pick<ModelObject, 'fit'>): ModelFit => (o.fit === 'keep' || o.fit === 'stretch' ? o.fit : 'scale')

// The shapes an object can stretch to: any shape with an outline of its own or a twin of one, that is not in the object itself.
export function stretchTargets(c: ModelContent, objectId: string): string[] {
  const o = c.objects.find(x => x.id === objectId)
  return o ? c.shapes.filter(s => !o.shapes.includes(s.id)).map(s => s.id) : []
}

// Set how an object fits. A stretching object needs a shape to follow (the shape it followed before is kept when none is given). A twin object follows its
// original, so it takes no mode of its own.
export function setFit(c: ModelContent, objectId: string, mode: ModelFit, fitTo?: string | null): Edit {
  const o = c.objects.find(x => x.id === objectId)
  if (!o) return fail('There is no such object.')
  if (o.mirrorOf) return fail('A twin follows its original: set how the original fits, or break the pair.')
  let target: string | null = null
  if (mode === 'stretch') {
    target = fitTo === undefined ? o.fitTo ?? null : fitTo
    if (target !== null) {
      const s = c.shapes.find(x => x.id === target)
      if (!s) return fail('That shape does not exist.')
      if (o.shapes.includes(s.id)) return fail('An object cannot stretch to a shape of its own.')
    }
  }
  const next: ModelObject = { ...o, fit: mode, fitTo: target }
  return done({ ...c, objects: c.objects.map(x => (x.id === objectId ? next : x)) },
    mode === 'stretch' && target === null ? 'Pick the shape it stretches to: until then it scales with its group.' : undefined)
}
