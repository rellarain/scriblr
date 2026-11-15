import type { ModelContent, ModelGroup, ModelZone } from '../../../../../api/types'
import type { Selection } from '../designerState'
import { groupById, groupOfObject, moveBefore, newGroup, objectById, objectOfShape, randomId, removeGroups, shapeById, type MakeId } from '../modelContent'
import { isCast } from './kinds'
import { LIMITS } from './limits'
import { drawOrder } from './order'
import { done, fail, type Edit } from './rigEdit'

// Zones (Z2): blocks of the tree between the model and its groups. A zone keeps its groups back to front, as the model keeps its groups; the zones themselves are
// stored back to front too, so the last zone is the one at the top of the tree, drawn in front. A model with zones is drawn in the order of its tree (order.ts). Pure.

// The zones a model in the shape editor starts with, top of the tree first (the user's list, 2026-11-15).
export const STARTER_ZONES = ['Head', 'Hair', 'Torso', 'Arms', 'Legs'] as const
// Where the groups of a model made before zones go.
export const OLD_GROUPS_ZONE = 'Torso'

export const zonesOf = (c: ModelContent): ModelZone[] => c.zones ?? []
export const zoneById = (c: ModelContent, id: string): ModelZone | undefined => zonesOf(c).find(z => z.id === id)
export const zoneOfGroup = (c: ModelContent, groupId: string): ModelZone | undefined => zonesOf(c).find(z => z.groups.includes(groupId))
// The zone at the top of the tree (the last stored, the one in front).
export const topZone = (c: ModelContent): ModelZone | undefined => zonesOf(c)[zonesOf(c).length - 1]
// The groups of a zone, in the order they are stored (back to front).
export const groupsOfZone = (c: ModelContent, z: ModelZone): ModelGroup[] => z.groups.map(id => groupById(c, id)).filter((g): g is ModelGroup => !!g)

// The five starter zones, stored back to front (Legs first, Head last: Head is at the top of the tree).
export function starterZones(make: MakeId = randomId): ModelZone[] {
  const taken = new Set<string>()
  return [...STARTER_ZONES].reverse().map(name => {
    let id = make('z')
    for (let i = 0; taken.has(id) && i < 20; i++) id = make('z')
    taken.add(id)
    return { id, name, groups: [] }
  })
}

// A model with no zones, or with groups in no zone, needs them (the shape editor gives them on opening).
export function needsZones(c: ModelContent): boolean {
  const zones = zonesOf(c)
  if (zones.length === 0) return true
  const inZone = new Set(zones.flatMap(z => z.groups))
  return c.groups.some(g => !inZone.has(g.id))
}

// Sorts by a key, keeping the order of equal keys.
function sortBy<T>(list: readonly T[], key: (t: T) => number): T[] {
  return list.map((t, i) => ({ t, i, k: key(t) })).sort((a, b) => a.k - b.k || a.i - b.i).map(x => x.t)
}

// The zones a model needs. A model with none gets the five starter zones and every group goes into Torso; as tree order is now the draw order, each object's shapes, each
// group's objects and Torso's groups are put in the order they were drawn in (by z and layer), so the drawing changes as little as it can. A group in no zone (one made before)
// goes to the top zone.
export function ensureZones(c: ModelContent, make: MakeId = randomId): ModelContent {
  if (!needsZones(c)) return c
  const zones = zonesOf(c)
  if (zones.length > 0) {
    const inZone = new Set(zones.flatMap(z => z.groups)), strays = c.groups.filter(g => !inZone.has(g.id)).map(g => g.id)
    const top = zones[zones.length - 1]
    return { ...c, zones: zones.map(z => (z.id === top.id ? { ...z, groups: [...z.groups, ...strays] } : z)) }
  }
  const place = new Map(drawOrder(c).map((s, i) => [s.id, i]))
  // shadows and lights are drawn above everything whatever the tree says: they do not decide where their object goes
  const cast = new Set(c.shapes.filter(isCast).map(s => s.id))
  const highest = (ids: readonly string[], at: (id: string) => number) => ids.reduce((m, id) => (cast.has(id) ? m : Math.max(m, at(id))), -1)
  const objects = c.objects.map(o => {
    const shapes = sortBy(o.shapes, id => place.get(id) ?? -1)
    return shapes.every((id, i) => id === o.shapes[i]) ? o : { ...o, shapes }
  })
  const objectTop = new Map(objects.map(o => [o.id, highest(o.shapes, id => place.get(id) ?? -1)]))
  const groups = c.groups.map(g => {
    const list = sortBy(g.objects, id => objectTop.get(id) ?? -1)
    return list.every((id, i) => id === g.objects[i]) ? g : { ...g, objects: list }
  })
  const groupTop = (g: ModelGroup) => highest(g.objects, id => objectTop.get(id) ?? -1)
  const torso = sortBy(groups, groupTop).map(g => g.id)
  const made = starterZones(make).map(z => (z.name === OLD_GROUPS_ZONE ? { ...z, groups: torso } : z))
  return { ...c, objects, groups, zones: made }
}

// ---- editing zones ----

// A new zone at the top of the tree.
export function addZone(c: ModelContent, zone: ModelZone): Edit {
  if (zonesOf(c).length >= LIMITS.zonesMax) return fail(`A model may have at most ${LIMITS.zonesMax} zones.`)
  return done({ ...c, zones: [...zonesOf(c), zone] })
}
export const renameZone = (c: ModelContent, id: string, name: string): ModelContent => ({ ...c, zones: zonesOf(c).map(z => (z.id === id ? { ...z, name: name.slice(0, LIMITS.zoneNameMax) } : z)) })
// A zone goes with its groups (and their objects and shapes).
export function removeZone(c: ModelContent, id: string): ModelContent {
  const z = zoneById(c, id)
  if (!z) return c
  const out = removeGroups(c, z.groups)
  return { ...out, zones: zonesOf(out).filter(x => x.id !== id) }
}
// A zone put before another in the stored order (null: last, the top of the tree).
export const moveZone = (c: ModelContent, id: string, beforeId: string | null): ModelContent => ({ ...c, zones: moveBefore(zonesOf(c), id, beforeId) })

// Puts `id` before `beforeId` in a list of ids (null, or an id not in it: at the end), taking it from where it was.
function placeIn(list: readonly string[], id: string, beforeId: string | null): string[] {
  const rest = list.filter(x => x !== id), at = beforeId === null ? -1 : rest.indexOf(beforeId)
  return at < 0 ? [...rest, id] : [...rest.slice(0, at), id, ...rest.slice(at)]
}

// A new group, at the top of a zone.
export function addGroupIn(c: ModelContent, group: ModelGroup, zoneId: string): ModelContent {
  return { ...c, groups: [...c.groups, group], zones: zonesOf(c).map(z => (z.id === zoneId ? { ...z, groups: [...z.groups, group.id] } : z)) }
}

// A group moved into a zone (its own or another), before a group of that zone in the stored order (null: last, the top of the zone).
export function moveGroupTo(c: ModelContent, groupId: string, zoneId: string, beforeId: string | null): Edit {
  if (!groupById(c, groupId)) return fail('There is no such group.')
  if (!zoneById(c, zoneId)) return fail('There is no such zone.')
  return done({ ...c, zones: zonesOf(c).map(z => (z.id === zoneId ? { ...z, groups: placeIn(z.groups, groupId, beforeId) } : z.groups.includes(groupId) ? { ...z, groups: z.groups.filter(g => g !== groupId) } : z)) })
}

// An object moved into a group (its own or another), before an object of that group in the stored order (null: last, the front).
export function moveObjectTo(c: ModelContent, objectId: string, groupId: string, beforeId: string | null, most: number = LIMITS.objectsPerGroupMax): Edit {
  const o = objectById(c, objectId), target = groupById(c, groupId)
  if (!o) return fail('There is no such object.')
  if (!target) return fail('There is no such group.')
  if (target.mirrorOf) return fail('A twin group follows its original: choose the original group.')
  const from = groupOfObject(c, objectId)
  if (from?.id !== groupId && target.objects.length >= most) return fail(`A group may have at most ${most} objects.`)
  return done({ ...c, groups: c.groups.map(g => (g.id === groupId ? { ...g, objects: placeIn(g.objects, objectId, beforeId) } : g.objects.includes(objectId) ? { ...g, objects: g.objects.filter(x => x !== objectId) } : g)) })
}

// A shape moved into an object (its own or another), before a shape of that object in the stored order (null: last, the front). Its points stay as they are.
export function moveShapeTo(c: ModelContent, shapeId: string, objectId: string, beforeId: string | null, most: number = LIMITS.shapesPerObjectMax): Edit {
  const s = shapeById(c, shapeId), target = objectById(c, objectId)
  if (!s) return fail('There is no such shape.')
  if (!target) return fail('There is no such object.')
  if (s.copyOf) return fail('A shape that follows the pattern stays in its member.')
  const from = objectOfShape(c, shapeId)
  if (from?.id !== objectId && target.shapes.length >= most) return fail(`An object may have at most ${most} shapes.`)
  return done({ ...c, objects: c.objects.map(o => (o.id === objectId ? { ...o, shapes: placeIn(o.shapes, shapeId, beforeId) } : o.shapes.includes(shapeId) ? { ...o, shapes: o.shapes.filter(x => x !== shapeId) } : o)) })
}

// ---- where new things go ----

// What a new shape goes into (Z2): the selected shape's object, or the selected object; else a new object in the selected group (or the group of what is selected); else a new
// group and object in the selected zone; else in the zone at the top of the tree.
export type NewPlace = { kind: 'object'; id: string } | { kind: 'group'; id: string } | { kind: 'zone'; id: string } | { kind: 'none' }
export function placeForNew(c: ModelContent, sel: Selection): NewPlace {
  if (sel.kind === 'shape') { const o = objectOfShape(c, sel.id); if (o) return { kind: 'object', id: o.id } }
  if (sel.kind === 'object' && objectById(c, sel.id)) return { kind: 'object', id: sel.id }
  if (sel.kind === 'group' && groupById(c, sel.id)) return { kind: 'group', id: sel.id }
  if (sel.kind === 'zone' && zoneById(c, sel.id)) return { kind: 'zone', id: sel.id }
  const top = topZone(c)
  return top ? { kind: 'zone', id: top.id } : { kind: 'none' }
}

// A new group in a zone, named by how many the model has.
export function newGroupIn(c: ModelContent, zoneId: string, make: MakeId = randomId): { content: ModelContent; groupId: string } {
  let id = make('g')
  const taken = new Set([...c.groups.map(g => g.id), ...c.objects.map(o => o.id), ...c.shapes.map(s => s.id), ...zonesOf(c).map(z => z.id)])
  for (let i = 0; taken.has(id) && i < 20; i++) id = make('g')
  return { content: addGroupIn(c, newGroup(id, `Group ${c.groups.length + 1}`), zoneId), groupId: id }
}
