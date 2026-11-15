import type { ModelAxis, ModelContent, ModelForm, ModelGroup, ModelObject, ModelPreset, ModelShape } from '../../../../api/types'
import type { Selection } from './designerState'
import { axesFor, chosenForm, presetsOf, templateOfMember, type Choices } from './engine/forms'
import { groupById, groupOfObject, objectById, objectOfShape, shapeById } from './modelContent'

// The designer's tree as nested cards, in pure functions. The tree is a stack of levels, outermost first: the models, then the groups of the open model, the objects of the open
// group, the shapes of the open object. At each level the sibling cards are listed only while none of them is open; the open one is shown alone (a slim card that stepping back
// onto shows the siblings again) with its children under it. Besides what a level contains, some cards carry states to choose among: the model's variants, a group's poses, an
// object's styles and expressions. They are listed the same way: all of them while none is on, the one that is on alone.
//
// What a level lists is in the order it is drawn in, topmost first: the order of the stored lists is back to front, so it is shown reversed.

export type CardKind = 'model' | 'zone' | 'variant' | 'group' | 'pose' | 'object' | 'style' | 'expression' | 'shape'
export const CARD_NAMES: Record<CardKind, string> = { model: 'Model', zone: 'Zone', variant: 'Variant', group: 'Group', pose: 'Pose', object: 'Object', style: 'Style', expression: 'Expression', shape: 'Shape' }

// The three levels that contain one another under the model.
export type Container = 'group' | 'object' | 'shape'
export interface TreeLevel<T> { kind: Container; cards: T[]; open: T | null }

export interface OpenPath { group: ModelGroup | null; object: ModelObject | null; shape: ModelShape | null }

// The group, object and shape a selection opens (a shape opens its object and that object's group; an object opens its group).
export function openPath(c: ModelContent, sel: Selection): OpenPath {
  if (sel.kind === 'shape') {
    const shape = shapeById(c, sel.id) ?? null, object = shape ? objectOfShape(c, shape.id) ?? null : null
    return { group: object ? groupOfObject(c, object.id) ?? null : null, object, shape }
  }
  if (sel.kind === 'object') {
    const object = objectById(c, sel.id) ?? null
    return { group: object ? groupOfObject(c, object.id) ?? null : null, object, shape: null }
  }
  if (sel.kind === 'group') return { group: groupById(c, sel.id) ?? null, object: null, shape: null }
  return { group: null, object: null, shape: null }
}

// Topmost first.
export const displayed = <T>(stored: readonly T[]): T[] => [...stored].reverse()

// Dropping a card before another in the displayed order (null: last, the bottommost) is, in the stored order (back to front), putting it after that card: before the stored card that
// follows it (null: last in the stored order, the front... that is, the displayed top).
export function storedBefore(stored: readonly string[], displayedBefore: string | null): string | null {
  if (displayedBefore === null) return stored[0] ?? null
  const at = stored.indexOf(displayedBefore)
  return at < 0 ? null : stored[at + 1] ?? null
}

// The groups, the open group's objects and the open object's shapes as levels, each with the card that is open at it (null: none, so the cards are listed). A level appears only
// when the one above it has an open card.
export function levelsOf(c: ModelContent, sel: Selection): Array<TreeLevel<ModelGroup> | TreeLevel<ModelObject> | TreeLevel<ModelShape>> {
  const path = openPath(c, sel)
  const levels: Array<TreeLevel<ModelGroup> | TreeLevel<ModelObject> | TreeLevel<ModelShape>> = []
  levels.push({ kind: 'group', cards: displayed(c.groups), open: path.group })
  if (!path.group) return levels
  const objects = path.group.objects.map(id => objectById(c, id)).filter((o): o is ModelObject => !!o)
  levels.push({ kind: 'object', cards: displayed(objects), open: path.object })
  if (!path.object) return levels
  const shapes = path.object.shapes.map(id => shapeById(c, id)).filter((s): s is ModelShape => !!s)
  levels.push({ kind: 'shape', cards: displayed(shapes), open: path.shape })
  return levels
}

// A click on a card: open it; a click on the card that is open, and is the deepest one, steps back up to what holds it (a click on an open card above the deepest one makes it the
// deepest, closing what was under it).
export function stepTo(c: ModelContent, sel: Selection, kind: Container, id: string): Selection {
  const path = openPath(c, sel)
  const deepest: Container | null = path.shape ? 'shape' : path.object ? 'object' : path.group ? 'group' : null
  const isOpen = (kind === 'group' && path.group?.id === id) || (kind === 'object' && path.object?.id === id) || (kind === 'shape' && path.shape?.id === id)
  if (isOpen && deepest === kind) {
    if (kind === 'shape') return path.object ? { kind: 'object', id: path.object.id } : { kind: 'none', id: '' }
    if (kind === 'object') return path.group ? { kind: 'group', id: path.group.id } : { kind: 'none', id: '' }
    return { kind: 'none', id: '' }
  }
  return { kind, id }
}

// ---- the states a card carries ----

// The model's variants: its presets that belong to no group or object (the kinds Age, Build, Outfit, Expression, Pose... are labelled on the card).
export const variantsOf = (c: ModelContent): ModelPreset[] => presetsOf(c).filter(p => !p.scope)
// A group's poses: the presets scoped to it.
export const posesOf = (c: ModelContent, groupId: string): ModelPreset[] => presetsOf(c).filter(p => p.scope === groupId)
// An object's styles.
export const stylesOfObject = (c: ModelContent, objectId: string): ModelPreset[] => presetsOf(c).filter(p => p.scope === objectId)

// An object's expressions: the forms of each of its axes (a member of a class takes its pattern's axes), with the one each axis shows now.
export interface Expression { axis: ModelAxis; forms: ModelForm[]; chosen: ModelForm | undefined }
export function expressionsOf(c: ModelContent, o: ModelObject, choices: Choices): Expression[] {
  const owner = templateOfMember(c, o) ?? o
  return axesFor(c, o).map(axis => ({ axis, forms: axis.options, chosen: chosenForm(owner, axis, choices, o.id) }))
}

// ---- the button at the top right of a card ----

// What the button does: hide or show the thing, add a sibling, or copy it (a twin, for what has one). Right-click moves on to the next that the card can do.
export type CardMode = 'hide' | 'plus' | 'copy'
export const CARD_MODES: Record<CardKind, CardMode[]> = {
  model: ['hide', 'plus', 'copy'],
  zone: ['hide', 'plus'],
  variant: ['plus', 'copy'],
  group: ['hide', 'plus', 'copy'],
  pose: ['plus', 'copy'],
  object: ['hide', 'plus', 'copy'],
  style: ['plus', 'copy'],
  expression: ['plus', 'copy'],
  shape: ['plus', 'copy'],
}
// Hide and show are for the open model and open group, and for the groups and objects listed beside each other (an object that is open has no such button).
export function modesFor(kind: CardKind, opts: { open: boolean } = { open: false }): CardMode[] {
  const all = CARD_MODES[kind]
  if (kind === 'object' && opts.open) return all.filter(m => m !== 'hide')
  return all
}
export function nextMode(modes: CardMode[], now: CardMode | undefined): CardMode {
  const at = now ? modes.indexOf(now) : -1
  return modes[(at + 1) % modes.length]
}

// ---- search ----

export interface Hit { kind: Container | 'zone'; id: string; name: string; crumbs: string }
// Cards of any level whose name has the text in it, with where each lies (the search lists them flat; a click on one opens its path).
export function searchHits(c: ModelContent, q: string): Hit[] {
  const text = q.trim().toLowerCase()
  if (!text) return []
  const has = (name: string) => name.toLowerCase().includes(text)
  const out: Hit[] = []
  for (const g of displayed(c.groups)) {
    const gname = g.name.trim() || 'Untitled group'
    if (has(g.name)) out.push({ kind: 'group', id: g.id, name: gname, crumbs: '' })
    for (const oid of displayed(g.objects)) {
      const o = objectById(c, oid)
      if (!o) continue
      const oname = o.name.trim() || 'Untitled object'
      if (has(o.name)) out.push({ kind: 'object', id: o.id, name: oname, crumbs: gname })
      for (const sid of displayed(o.shapes)) {
        const s = shapeById(c, sid)
        if (s && has(s.name)) out.push({ kind: 'shape', id: s.id, name: s.name.trim() || 'Untitled shape', crumbs: `${gname} › ${oname}` })
      }
    }
  }
  return out
}

// ---- the shape editor's tree (Z2) ----
// Nested cards: the model, its zones, their groups, objects and shapes (a shape lists its points). Every card stays listed with its siblings whether or not another is
// selected; a card's children show while it is expanded. The zones are expanded unless closed; the rest is collapsed unless opened, and selecting something opens the way
// down to it.

export type TreeKind = 'zone' | 'group' | 'object' | 'shape'
const DEPTH: Record<TreeKind, number> = { zone: 0, group: 1, object: 2, shape: 3 }

// Is a card expanded: what the author chose for it, else zones yes and the rest no.
export const isExpanded = (kind: TreeKind | 'model', id: string, chosen: Readonly<Record<string, boolean>>): boolean => chosen[id] ?? (kind === 'zone' || kind === 'model')

// The cards a selection lies in, outermost first: a shape's zone, group and object; an object's zone and group; a group's zone. A selected point's shape is in it too, and a
// mirror's original (Z3: a mirror is listed inside its original's card when they are side by side).
export function pathTo(c: ModelContent, sel: Selection, point = false): string[] {
  const zoneOf = (groupId: string) => (c.zones ?? []).find(z => z.groups.includes(groupId))?.id
  const out: string[] = []
  const group = (id: string | undefined) => { if (!id) return; const z = zoneOf(id); if (z) out.push(z); out.push(id) }
  const object = (o: ModelObject) => {
    const g = groupOfObject(c, o.id)
    group(g?.id)
    const of = o.mirrorOf ?? o.cloneOf
    if (of && g?.objects.includes(of)) out.push(of)
  }
  if (sel.kind === 'shape') {
    const o = objectOfShape(c, sel.id), s = shapeById(c, sel.id)
    if (o) { object(o); out.push(o.id) }
    const of = s?.mirrorOf ?? s?.cloneOf
    if (o && of && o.shapes.includes(of)) out.push(of)
    if (point) out.push(sel.id)
  } else if (sel.kind === 'object') { const o = objectById(c, sel.id); if (o) object(o) }
  else if (sel.kind === 'group') { const z = zoneOf(sel.id); if (z) out.push(z) }
  return out
}

// What a card being dragged does over another card: lands beside it when they are of a kind, goes into it when it is of the level above, else nothing.
export type DropWhere = 'before' | 'after' | 'into'
export function dropRule(dragged: TreeKind, over: TreeKind): 'beside' | 'into' | null {
  if (dragged === over) return 'beside'
  return DEPTH[over] === DEPTH[dragged] - 1 ? 'into' : null
}

// Where a card dropped beside another (before or after it as listed, topmost first) or into a parent (at the top) goes in the stored order (back to front): the id to
// put it before, or null for last (the top).
export function storedSpot(stored: readonly string[], moving: string, target: string | null, where: DropWhere): string | null {
  if (where === 'into' || target === null) return null
  const rest = stored.filter(id => id !== moving)
  if (where === 'after') return rest.includes(target) ? target : null
  const at = rest.indexOf(target)
  return at < 0 ? null : rest[at + 1] ?? null
}

// The cards of the shape editor's search: zones too, with where each lies.
export function zoneSearchHits(c: ModelContent, q: string): Hit[] {
  const text = q.trim().toLowerCase()
  if (!text) return []
  const zones = c.zones ?? []
  if (zones.length === 0) return searchHits(c, q)
  const has = (name: string) => name.toLowerCase().includes(text)
  const out: Hit[] = []
  for (const z of displayed(zones)) {
    const zname = z.name.trim() || 'Untitled zone'
    if (has(z.name)) out.push({ kind: 'zone', id: z.id, name: zname, crumbs: '' })
    for (const gid of displayed(z.groups)) {
      const g = groupById(c, gid)
      if (!g) continue
      const gname = g.name.trim() || 'Untitled group'
      if (has(g.name)) out.push({ kind: 'group', id: g.id, name: gname, crumbs: zname })
      for (const oid of displayed(g.objects)) {
        const o = objectById(c, oid)
        if (!o) continue
        const oname = o.name.trim() || 'Untitled object'
        if (has(o.name)) out.push({ kind: 'object', id: o.id, name: oname, crumbs: `${zname} › ${gname}` })
        for (const sid of displayed(o.shapes)) {
          const s = shapeById(c, sid)
          if (s && has(s.name)) out.push({ kind: 'shape', id: s.id, name: s.name.trim() || 'Untitled shape', crumbs: `${zname} › ${gname} › ${oname}` })
        }
      }
    }
  }
  return out
}
