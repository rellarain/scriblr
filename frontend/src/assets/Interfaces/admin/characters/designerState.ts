import type { ModelContent, ModelShape } from '../../../../api/types'
import { objectById, groupById, objectOfShape, shapeById } from './modelContent'

// What is selected in the designer, and how the right button moves through the modes. Pure, so it is tested without the page.

export type SelKind = 'none' | 'group' | 'object' | 'shape'
export interface Selection { kind: SelKind; id: string }
export const NONE: Selection = { kind: 'none', id: '' }
export type EditMode = 'points' | 'move'

export const same = (a: Selection, b: Selection): boolean => a.kind === b.kind && a.id === b.id

// The shapes a selection points at: the shape itself, an object's shapes, a group's objects' shapes, or none.
export function shapesOf(c: ModelContent, sel: Selection): ModelShape[] {
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
  return sel
}

// The shape selected, or the only shape of what is selected.
export function activeShape(c: ModelContent, sel: Selection): ModelShape | undefined {
  return sel.kind === 'shape' ? shapeById(c, sel.id) : undefined
}

// The object a selection is in (for adding a shape next to it): the object, the shape's object, or none.
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

// Right-clicking a shape moves through: select it and edit its points, then move the whole shape, then unselect it. Right-clicking the grid
// unselects everything, to see the end result.
export function rightClickShape(sel: Selection, mode: EditMode, shapeId: string): { sel: Selection; mode: EditMode } {
  if (sel.kind !== 'shape' || sel.id !== shapeId) return { sel: { kind: 'shape', id: shapeId }, mode: 'points' }
  if (mode === 'points') return { sel, mode: 'move' }
  return { sel: NONE, mode: 'points' }
}
export const rightClickGrid = (): { sel: Selection; mode: EditMode } => ({ sel: NONE, mode: 'points' })
