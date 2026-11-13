import type { ModelAxis, ModelClass, ModelContent, ModelObject, ModelPoint, ModelShape } from '../../../../../api/types'
import { bakedPaint } from './colour'
import { NAME_MAX, freshId, goneWith, groupOfObject, objectById, randomId, shapeById, type MakeId } from '../modelContent'
import { freshFormId } from './formEdit'
import { axesOf, classKey, classesOf, membersOf } from './forms'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'

// Classes: an object (the template) and members built from it. The template is a pattern, not drawn once it has members; each member has a shape for every
// shape of the template, which follows it (no points of its own) until the member is given an outline of its own, or leaves it out. A member chooses among the
// template's axes of forms with its own choice, and may add shapes of its own. A family shows one member at a time; otherwise every member is drawn. Detaching a
// member copies what it follows once and makes it an ordinary object. The solver (rig.ts) does the following and the showing; this file only changes content.

const copyPts = (list: ModelPoint[]): ModelPoint[] => list.map(p => ({ ...p, hi: p.hi ? [p.hi[0], p.hi[1]] : p.hi, ho: p.ho ? [p.ho[0], p.ho[1]] : p.ho }))
const clean = (name: string) => name.trim().slice(0, NAME_MAX)

export const classById = (c: ModelContent, id: string): ModelClass | undefined => classesOf(c).find(k => k.id === id)
export const classOfTemplate = (c: ModelContent, objectId: string): ModelClass | undefined => classesOf(c).find(k => k.template === objectId)
// The class an object belongs to, as its template or as a member.
export const classOfObject = (c: ModelContent, o: ModelObject): ModelClass | undefined => classById(c, o.classOf ?? '') ?? classOfTemplate(c, o.id)

// The shapes of the template that members follow: those with an outline of their own (a twin has none, and a member's own shapes are not the template's).
const followable = (c: ModelContent, t: ModelObject): ModelShape[] => t.shapes.map(id => shapeById(c, id)).filter((s): s is ModelShape => !!s && !s.mirrorOf && !s.copyOf)

// The shape a member keeps for a shape of the template: it follows it (no points), and starts with the same settings.
const derivedShape = (id: string, t: ModelShape): ModelShape => ({
  id, name: t.name, closed: t.closed, z: t.z, op: t.op, view: t.view, pts: [], half: 0, template: null, mirrorOf: null, back: null, zBack: t.zBack ?? null, loose: null, copyOf: t.id, hide: false,
})

// The shape of the template that a member's shape follows (undefined for a shape of its own).
export const followedShape = (c: ModelContent, s: ModelShape): ModelShape | undefined => (s.copyOf ? shapeById(c, s.copyOf) : undefined)

// ---- classes ----

// Make a class of an object: it becomes the template. A family shows one member at a time (a character uses one); otherwise every member is drawn.
export function makeClass(c: ModelContent, objectId: string, name: string, exclusive: boolean, make: MakeId = randomId): Edit & { classId?: string } {
  const o = objectById(c, objectId)
  if (!o) return fail('There is no such object.')
  if (o.mirrorOf) return fail('A twin cannot be the template of a class: use its original.')
  if (o.classOf) return fail('This object is already a member of a class.')
  if (classOfTemplate(c, objectId)) return fail('This object is already the template of a class.')
  if (o.shapes.some(id => shapeById(c, id)?.mirrorOf)) return fail('A template cannot hold twins: break the pairs inside it first, or make them separate objects.')
  if (classesOf(c).length >= LIMITS.classesMax) return fail(`A model may have at most ${LIMITS.classesMax} classes.`)
  const id = freshFormId(classesOf(c).map(k => k.id), 'k', make)
  const k: ModelClass = { id, name: clean(name) || clean(o.name) || 'Class', template: objectId, exclusive }
  return { ...done({ ...c, classes: [...classesOf(c), k] }), classId: id }
}

export const renameClass = (c: ModelContent, classId: string, name: string): ModelContent => ({ ...c, classes: classesOf(c).map(k => (k.id === classId ? { ...k, name } : k)) })
export const setExclusive = (c: ModelContent, classId: string, exclusive: boolean): ModelContent => ({ ...c, classes: classesOf(c).map(k => (k.id === classId ? { ...k, exclusive } : k)) })

// A new member, right after the last member (or the template) in the template's group, with a shape that follows each shape of the template.
export function addMember(c: ModelContent, classId: string, make: MakeId = randomId): Edit & { memberId?: string } {
  const k = classById(c, classId), t = k && objectById(c, k.template)
  if (!k || !t) return fail('There is no such class.')
  const members = membersOf(c, classId)
  if (members.length >= LIMITS.membersMax) return fail(`A class may have at most ${LIMITS.membersMax} members.`)
  const group = groupOfObject(c, t.id)
  if (!group) return fail('Put the template in a group first.')
  if (group.objects.length >= LIMITS.objectsPerGroupMax) return fail(`A group may have at most ${LIMITS.objectsPerGroupMax} objects.`)
  let next = c
  const shapeIds: string[] = []
  for (const s of followable(c, t)) {
    const id = freshId(next, 's', make)
    next = { ...next, shapes: [...next.shapes, derivedShape(id, s)] }
    shapeIds.push(id)
  }
  const memberId = freshId(next, 'o', make)
  const member: ModelObject = { id: memberId, name: `${t.name.trim() || 'Object'} ${members.length + 1}`.slice(0, NAME_MAX), layer: t.layer, shapes: shapeIds, mirrorOf: null, axes: [], classOf: classId }
  const at = Math.max(...[t, ...members].map(o => group.objects.indexOf(o.id)))
  next = {
    ...next,
    objects: [...next.objects, member],
    groups: next.groups.map(g => (g.id === group.id ? { ...g, objects: [...g.objects.slice(0, at + 1), memberId, ...g.objects.slice(at + 1)] } : g)),
  }
  return { ...done(next), memberId }
}

// Keep every member's shapes in step with the template's: a member gets a shape for each shape the template has, loses the ones whose template shape is gone
// (or became a twin), and never follows a shape twice. Returns the content itself when nothing needed doing, so it is cheap to call after every edit.
export function reconcileClasses(c: ModelContent, make: MakeId = randomId): ModelContent {
  if (classesOf(c).length === 0 && !c.objects.some(o => o.classOf) && !c.shapes.some(s => s.copyOf)) return c
  let next = c, changed = false
  for (const k of classesOf(c)) {
    const t = objectById(next, k.template)
    if (!t || t.classOf || t.mirrorOf) continue
    const wanted = followable(next, t), wantedIds = new Set(wanted.map(s => s.id))
    for (const m of membersOf(next, k.id)) {
      if (m.id === t.id) continue
      const following = new Set<string>(), drop = new Set<string>()
      for (const id of m.shapes) {
        const s = shapeById(next, id)
        if (!s?.copyOf) continue
        if (!wantedIds.has(s.copyOf) || following.has(s.copyOf)) drop.add(id)
        else following.add(s.copyOf)
      }
      const missing = wanted.filter(s => !following.has(s.id))
      if (drop.size === 0 && missing.length === 0) continue
      changed = true
      const ids = m.shapes.filter(id => !drop.has(id))
      let draft: ModelContent = { ...next, shapes: next.shapes.filter(s => !drop.has(s.id)) }
      for (const s of missing) {
        const id = freshId(draft, 's', make)
        draft = { ...draft, shapes: [...draft.shapes, derivedShape(id, s)] }
        ids.push(id)
      }
      next = { ...draft, objects: draft.objects.map(o => (o.id === m.id ? { ...o, shapes: ids } : o)) }
    }
  }
  return changed ? next : c
}

// ---- leaving a class ----

// A member stops being one: what it followed it keeps as its own (the template's outlines as they are, with the template's axes of forms, and the member's own
// choices carry over), what it left out is gone. The template and the other members are not touched; sliders that move the template no longer move it.
export function detachMember(c: ModelContent, memberId: string): Edit {
  const m = objectById(c, memberId), k = m?.classOf ? classById(c, m.classOf) : undefined
  if (!m || !m.classOf) return fail('That object is not a member of a class.')
  const t = k ? objectById(c, k.template) : undefined
  const follows = new Map<string, string>()   // a shape of the template -> this member's shape for it
  const dropped = new Set<string>()
  const shapes = c.shapes.flatMap((s): ModelShape[] => {
    if (!m.shapes.includes(s.id) || !s.copyOf) return [s]
    const src = shapeById(c, s.copyOf)
    if (s.hide || !src) { dropped.add(s.id); return [] }
    follows.set(src.id, s.id)
    const own = s.pts.length >= 3
    return [{ ...s, pts: own ? s.pts : copyPts(src.pts), back: own ? s.back ?? null : s.back ?? (src.back ? copyPts(src.back) : null), closed: own ? s.closed : src.closed, copyOf: null, hide: false, ...bakedPaint(c, s), opBy: s.opBy ?? src.opBy ?? null, ...(!own && (src.skin ?? []).length ? { skin: (src.skin ?? []).map(k => ({ g: k.g, w: [...k.w] })) } : {}) }]
  })
  const axes: ModelAxis[] = (t ? axesOf(t) : []).map(a => ({
    ...a, options: a.options.map(f => ({
      ...f, ovr: f.ovr.flatMap(v => { const mine = follows.get(v.shape); return mine ? [{ shape: mine, pts: copyPts(v.pts) }] : [] }),
      looks: (f.looks ?? []).flatMap(l => { const mine = follows.get(l.shape); return mine ? [{ ...l, shape: mine }] : [] }),
    })),
  }))
  return done({
    ...c,
    shapes,
    objects: c.objects.map(o => (o.id === memberId ? { ...o, shapes: o.shapes.filter(id => !dropped.has(id)), axes, classOf: null, ...(!(o.under ?? []).length && (t?.under ?? []).length ? { under: [...t!.under!] } : {}) } : o)),
    presets: (c.presets ?? []).map(p => dropClassChoice(p, memberId)),
  })
}

// A style that remembers this member as the one shown forgets it.
function dropClassChoice<P extends { forms?: Record<string, string> }>(p: P, memberId: string): P {
  const forms = p.forms ?? {}
  const keep = Object.keys(forms).filter(key => !(key.startsWith('class:') && forms[key] === memberId))
  return keep.length === Object.keys(forms).length ? p : { ...p, forms: Object.fromEntries(keep.map(key => [key, forms[key]])) }
}

// Delete a class: every member is detached (and keeps its look), the template is an ordinary object again.
export function deleteClass(c: ModelContent, classId: string): Edit {
  if (!classById(c, classId)) return fail('There is no such class.')
  let next = c
  for (const m of membersOf(c, classId)) {
    const e = detachMember(next, m.id)
    if (!e.ok) return e
    next = e.content
  }
  const key = classKey(classId)
  return done({
    ...next,
    classes: classesOf(next).filter(k => k.id !== classId),
    objects: next.objects.map(o => ((o.under ?? []).includes(classId) ? { ...o, under: (o.under ?? []).filter(t => t !== classId) } : o)),
    presets: (next.presets ?? []).map(p => (p.forms && key in p.forms ? { ...p, forms: Object.fromEntries(Object.entries(p.forms).filter(([k]) => k !== key)) } : p)),
  })
}

// Before things are deleted: the members of a class whose template is among them are detached first, so they keep their look instead of losing what they followed.
export function detachBeforeRemoval(c: ModelContent, seed: { shapes?: string[]; objects?: string[]; groups?: string[] }): ModelContent {
  const gone = goneWith(c, seed)
  let next = c
  for (const k of classesOf(c)) {
    if (!gone.objects.has(k.template)) continue
    for (const m of membersOf(next, k.id)) {
      if (gone.objects.has(m.id)) continue
      const e = detachMember(next, m.id)
      if (e.ok) next = e.content
    }
  }
  return next
}

// ---- a member's shapes ----

// A shape of a member follows the template's again (its own outline, and its own back outline, are dropped).
export const followTemplate = (c: ModelContent, shapeId: string): ModelContent => ({ ...c, shapes: c.shapes.map(s => (s.id === shapeId && s.copyOf ? { ...s, pts: [], back: null } : s)) })

// An inherited shape is left out of the member (or put back); a shape of the member's own is never hidden this way.
export const setShapeHide = (c: ModelContent, shapeId: string, hide: boolean): ModelContent => ({ ...c, shapes: c.shapes.map(s => (s.id === shapeId && s.copyOf ? { ...s, hide } : s)) })

// An object moves to another group (a member put in the group of the other hand): it goes to the end of the group's objects.
export function moveObjectToGroup(c: ModelContent, objectId: string, groupId: string): Edit {
  const o = objectById(c, objectId), target = c.groups.find(g => g.id === groupId)
  if (!o) return fail('There is no such object.')
  if (!target) return fail('There is no such group.')
  if (target.mirrorOf) return fail('A twin group follows its original: choose the original group.')
  const from = groupOfObject(c, objectId)
  if (from?.id === groupId) return done(c)
  if (target.objects.length >= LIMITS.objectsPerGroupMax) return fail(`A group may have at most ${LIMITS.objectsPerGroupMax} objects.`)
  return done({ ...c, groups: c.groups.map(g => (g.id === groupId ? { ...g, objects: [...g.objects, objectId] } : g.id === from?.id ? { ...g, objects: g.objects.filter(id => id !== objectId) } : g)) })
}
