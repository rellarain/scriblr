import type { ModelContent, ModelObject } from '../../../../../api/types'
import { objectById } from '../modelContent'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'

// What an object is worn under (phase 6b). A garment may be worn under others (a shirt under a jacket, underwear under the clothes): while any of them is shown, the garment is
// trimmed to their outlines, so it never shows outside them. The outlines are the shapes' own, without their cut-outs (an open neckline still shows what is under it), and with none
// of the garments shown nothing is trimmed. A twin follows its original, and a member of a class that names nothing follows the class's template. Pure.

const label = (o: ModelObject): string => o.name.trim() || 'Untitled object'
const classOf = (c: ModelContent, id: string) => (c.classes ?? []).find(k => k.id === id)

// The list the object has, or its class template's when it is a member that has none of its own.
function listOf(c: ModelContent, o: ModelObject): string[] {
  const own = o.under ?? []
  if (own.length > 0 || !o.classOf) return own
  const template = classOf(c, o.classOf) && objectById(c, classOf(c, o.classOf)!.template)
  return template && template.id !== o.id ? template.under ?? [] : []
}

// What the object is worn under as it is drawn: a twin goes with its original, and each garment is the one on the same side (the twin of what its original is worn under, when that
// has one, so a left sleeve is trimmed by the left sleeve of the jacket). A family (a class) is named as it is.
export function wornUnder(c: ModelContent, o: ModelObject): string[] {
  const original = o.mirrorOf ? objectById(c, o.mirrorOf) : undefined
  if (!original) return listOf(c, o)
  return listOf(c, original).map(id => c.objects.find(x => x.mirrorOf === id)?.id ?? id)
}

// The objects whose outlines trim this one: those it is worn under, and for a family its template and its members (which of them is shown is for the drawing to say).
export function coveringObjects(c: ModelContent, o: ModelObject): ModelObject[] {
  const out = new Map<string, ModelObject>()
  for (const id of wornUnder(c, o)) {
    const k = classOf(c, id)
    const ids = k ? [k.template, ...c.objects.filter(x => x.classOf === k.id).map(x => x.id)] : [id]
    for (const oid of ids) {
      const t = objectById(c, oid)
      if (t && t.id !== o.id) out.set(t.id, t)
    }
  }
  return [...out.values()]
}

// Whether `from` is worn under `goal`, through any chain of garments.
function reaches(c: ModelContent, from: ModelObject, goal: string, seen = new Set<string>()): boolean {
  for (const t of coveringObjects(c, from)) {
    if (t.id === goal) return true
    if (seen.has(t.id)) continue
    seen.add(t.id)
    if (reaches(c, t, goal, seen)) return true
  }
  return false
}

// The pair, if any, that the model keeps in order between two sets of objects (a garment with its twins, a family): an object of one that is worn under an object of the other,
// through any chain of garments.
export function wearPair(c: ModelContent, a: ModelObject[], b: ModelObject[]): { under: ModelObject; over: ModelObject } | null {
  for (const x of a) for (const y of b) {
    if (reaches(c, x, y.id)) return { under: x, over: y }
    if (reaches(c, y, x.id)) return { under: y, over: x }
  }
  return null
}

// An object that is worn under something that is worn under it (each would trim the other).
export const wearsRoundInACircle = (c: ModelContent, o: ModelObject): boolean => reaches(c, o, o.id)

// What an object can be worn under: the other clothing objects that are not twins, and the families whose template is clothing.
export interface UnderChoice { id: string; name: string; family: boolean }
export function underChoices(c: ModelContent, objectId: string): UnderChoice[] {
  const out: UnderChoice[] = []
  for (const o of c.objects) if (o.id !== objectId && o.layer === 'clothing' && !o.mirrorOf && !o.classOf) out.push({ id: o.id, name: label(o), family: false })
  for (const k of c.classes ?? []) {
    const t = objectById(c, k.template)
    if (t && t.layer === 'clothing' && t.id !== objectId && !(objectById(c, objectId)?.classOf === k.id)) out.push({ id: k.id, name: k.name.trim() || label(t), family: true })
  }
  return out
}

// A garment is put under another, or taken out from under it. Refused for a twin (it follows its original), for itself, for something that is no object or family, for one that
// is worn under it already (each would trim the other) and past the limit.
export function toggleUnder(c: ModelContent, objectId: string, targetId: string): Edit {
  const o = objectById(c, objectId)
  if (!o) return fail('There is no such object.')
  if (o.mirrorOf) return fail(`${label(o)} is a twin: it is worn under what its original is worn under.`)
  const own = o.under ?? []
  const set = (under: string[]): ModelContent => ({ ...c, objects: c.objects.map(x => (x.id === objectId ? { ...x, under } : x)) })
  if (own.includes(targetId)) return done(set(own.filter(t => t !== targetId)))
  if (targetId === objectId) return fail(`${label(o)} cannot be worn under itself.`)
  const target = objectById(c, targetId), family = classOf(c, targetId)
  if (!target && !family) return fail('There is no such garment or family to be worn under.')
  if (own.length >= LIMITS.underMax) return fail(`An object may be worn under at most ${LIMITS.underMax} garments or families.`)
  const next = set([...own, targetId])
  const there = objectById(next, objectId)!
  if (wearsRoundInACircle(next, there)) return fail(`${label(o)} cannot be worn under ${target ? label(target) : family!.name.trim() || 'that family'}: that is worn under ${label(o)} already.`)
  return done(next)
}
