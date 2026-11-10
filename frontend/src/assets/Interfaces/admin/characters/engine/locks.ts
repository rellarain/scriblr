import type { ModelContent, ModelHsl, ModelObject, ModelSlot } from '../../../../../api/types'
import { paintSource, slotById, type HslLocks } from './colour'
import { presetsOf } from './forms'
import { isOn, type TestState } from './presets'
import { done, fail, type Edit } from './rigEdit'

// Locked and free parts of a colour (phase D3a). An object holds, for a colour slot it is painted from, its hue, its saturation and its lightness each at one value
// or free; a style holds the same while it is on. A locked part replaces that part of whatever colour is chosen for the slot (a default colour, or a swatch of the
// palette), for the shapes of that object only, so the object keeps its colour when the character's palette changes or the look is rolled. The object's own lock wins
// over a style's: a style only locks the parts the object leaves free.

export type LockPart = 'h' | 's' | 'l'
export const LOCK_PARTS: Array<{ id: LockPart; name: string; top: number }> = [{ id: 'h', name: 'Hue', top: 359 }, { id: 's', name: 'Saturation', top: 100 }, { id: 'l', name: 'Lightness', top: 100 }]
export const FREE: ModelHsl = { h: null, s: null, l: null }

const mergeLock = (first: ModelHsl, second: ModelHsl): ModelHsl => ({ h: first.h ?? second.h, s: first.s ?? second.s, l: first.l ?? second.l })
const holds = (l: ModelHsl | undefined): boolean => !!l && (l.h !== null || l.s !== null || l.l !== null)

// The locks of every object that has any: its own, or (a twin with none of its own) its original's.
export function objectLocks(c: ModelContent): HslLocks {
  const out: HslLocks = {}
  for (const o of c.objects) {
    const own = o.hsl ?? {}
    const from = Object.keys(own).length > 0 ? own : o.mirrorOf ? c.objects.find(x => x.id === o.mirrorOf)?.hsl ?? {} : {}
    if (Object.keys(from).length > 0) out[o.id] = { ...from }
  }
  return out
}

// The locks that hold now: the objects' own, and those of the styles that are on, which fill only the parts an object leaves free.
export function activeLocks(c: ModelContent, state: TestState): HslLocks {
  const out = objectLocks(c)
  for (const st of presetsOf(c)) {
    if (!st.scope || !Object.values(st.hsl ?? {}).some(holds)) continue
    const object = c.objects.find(o => o.id === st.scope)
    if (!object || !isOn(c, state, st)) continue
    for (const target of [object, ...c.objects.filter(t => t.mirrorOf === object.id)]) {
      const here = { ...(out[target.id] ?? {}) }
      for (const [slotId, lock] of Object.entries(st.hsl ?? {})) here[slotId] = mergeLock(here[slotId] ?? FREE, lock)
      out[target.id] = here
    }
  }
  return out
}

// The colour slots an object is painted from (in the order its shapes first use them), which are the ones it can hold parts of.
export function slotsUsedBy(c: ModelContent, object: ModelObject): ModelSlot[] {
  const seen = new Set<string>(), out: ModelSlot[] = []
  for (const id of object.shapes) {
    const shape = c.shapes.find(x => x.id === id)
    const slot = shape ? paintSource(c, shape).slot : null
    if (slot && !seen.has(slot.id)) { seen.add(slot.id); out.push(slot) }
  }
  return out
}

// The locks of a slot after one part is set to a value (null: free); a lock that holds nothing is dropped.
function withPart(locks: Record<string, ModelHsl> | undefined, slotId: string, part: LockPart, value: number | null): Record<string, ModelHsl> {
  const top = LOCK_PARTS.find(p => p.id === part)!.top
  const next = { ...(locks ?? {}) }
  const lock = { ...(next[slotId] ?? FREE), [part]: value === null ? null : Math.round(Math.min(top, Math.max(0, value))) }
  if (holds(lock)) next[slotId] = lock
  else delete next[slotId]
  return next
}

// Set one part of the colour an object holds for a slot. A twin follows its original, so its lock is the original's.
export function setObjectLock(c: ModelContent, objectId: string, slotId: string, part: LockPart, value: number | null): Edit {
  const object = c.objects.find(o => o.id === objectId)
  if (!object) return fail('There is no such object.')
  if (object.mirrorOf) return fail('A twin follows its original: lock the original.')
  if (!slotById(c, slotId)) return fail('There is no such colour slot.')
  return done({ ...c, objects: c.objects.map(o => (o.id === objectId ? { ...o, hsl: withPart(o.hsl, slotId, part, value) } : o)) })
}

// The same for a style (a preset whose scope is an object).
export function setStyleLock(c: ModelContent, presetId: string, slotId: string, part: LockPart, value: number | null): Edit {
  const style = presetsOf(c).find(p => p.id === presetId)
  if (!style || !style.scope || !c.objects.some(o => o.id === style.scope)) return fail('There is no such style.')
  if (!slotById(c, slotId)) return fail('There is no such colour slot.')
  return done({ ...c, presets: presetsOf(c).map(p => (p.id === presetId ? { ...p, hsl: withPart(p.hsl, slotId, part, value) } : p)) })
}
