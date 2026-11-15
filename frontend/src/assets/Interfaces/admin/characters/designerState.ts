import type { ModelContent, ModelObject, ModelShape } from '../../../../api/types'
import { objectById, groupById, objectOfShape, shapeById } from './modelContent'

// What is selected in the designer, and how the right button moves through the modes. Pure, so it is tested without the page.

// a zone (Z2) is the block of the tree above the groups
export type SelKind = 'none' | 'zone' | 'group' | 'object' | 'shape'
export interface Selection { kind: SelKind; id: string }
export const NONE: Selection = { kind: 'none', id: '' }
// What of the selected shape is selected (S2 of the shape editor): the shape as a whole, one of its points, or one of its segments (segment e runs from point e to the next).
export type PartKind = 'shape' | 'point' | 'segment'

export const same = (a: Selection, b: Selection): boolean => a.kind === b.kind && a.id === b.id

// The shapes a selection points at: the shape itself, an object's shapes, a group's objects' shapes, a zone's groups' shapes, or none.
export function shapesOf(c: ModelContent, sel: Selection): ModelShape[] {
  if (sel.kind === 'zone') {
    const z = (c.zones ?? []).find(x => x.id === sel.id)
    return z ? z.groups.flatMap(gid => shapesOf(c, { kind: 'group', id: gid })) : []
  }
  if (sel.kind === 'shape') { const s = shapeById(c, sel.id); return s ? [s] : [] }
  if (sel.kind === 'object') { const o = objectById(c, sel.id); return o ? o.shapes.map(id => shapeById(c, id)).filter((s): s is ModelShape => !!s) : [] }
  if (sel.kind === 'group') {
    const g = groupById(c, sel.id)
    return g ? g.objects.flatMap(oid => objectById(c, oid)?.shapes ?? []).map(id => shapeById(c, id)).filter((s): s is ModelShape => !!s) : []
  }
  return []
}

// The selection when what it pointed at has gone (a deleted shape): its object, else nothing.
export function repair(c: ModelContent, sel: Selection): Selection {
  if (sel.kind === 'shape' && !shapeById(c, sel.id)) return NONE
  if (sel.kind === 'object' && !objectById(c, sel.id)) return NONE
  if (sel.kind === 'group' && !groupById(c, sel.id)) return NONE
  if (sel.kind === 'zone' && !(c.zones ?? []).some(z => z.id === sel.id)) return NONE
  return sel
}

// The shape selected, or the only shape of what is selected.
export function activeShape(c: ModelContent, sel: Selection): ModelShape | undefined {
  return sel.kind === 'shape' ? shapeById(c, sel.id) : undefined
}

// The object a selection is in (for adding a shape next to it): the object, the shape's object, or none.
// The object that is open, or the one the open shape is in.
export const contextObjectOf = (c: ModelContent, sel: Selection): ModelObject | null => {
  const id = contextObject(c, sel)
  return id ? c.objects.find(o => o.id === id) ?? null : null
}
export function contextObject(c: ModelContent, sel: Selection): string | undefined {
  if (sel.kind === 'object') return sel.id
  if (sel.kind === 'shape') return objectOfShape(c, sel.id)?.id
  return undefined
}

// The objects drawn whatever their class says: the one selected (or the one the selected shape is in), so that a pattern, or a member of a family that is not
// the one chosen, can be looked at and edited.
export function showFor(c: ModelContent, sel: Selection): string[] {
  const o = contextObject(c, sel)
  return o ? [o] : []
}

// What the right button does when it is clicked (not dragged): on a point it changes the point's type and on a segment it makes the segment straight or curved (the page
// does those); on the body of a shape it selects the shape; on the empty grid it unselects everything, to see the end result.
export type RightTarget = { kind: 'grid' } | { kind: 'shape'; id: string } | { kind: 'point'; id: string; i: number } | { kind: 'segment'; id: string; e: number }
export const rightClickShape = (shapeId: string): Selection => ({ kind: 'shape', id: shapeId })
export const rightClickGrid = (): Selection => NONE
