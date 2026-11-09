import type { ModelContent, ModelFallSide, ModelSwatch } from '../../../../../api/types'
import { paintSource, rollChoices, type Rng, type SlotChoices } from './colour'
import { axesFor, classKey, classesOf, formKey, membersOf, type Choices } from './forms'
import { descendantsOf } from './rig'
import { FALL_SIDES } from '../modelContent'

// Rolling the look of the test character: a new colour for every colour slot (a default colour that fits the genre, or a swatch of the palette), a form on every axis
// and the member of every family that is shown. Things that are LOCKED (an object or a group, and everything in it) are left as they are: their forms and members, and
// the colours of the slots they are painted from. Nothing here is saved.

// The ids of everything a lock covers: the locked groups with the groups hung under them, and every object in those, and the locked objects.
export function lockedThings(c: ModelContent, locks: readonly string[]): { groups: Set<string>; objects: Set<string> } {
  const groups = new Set<string>(), objects = new Set<string>()
  for (const id of locks) {
    if (c.groups.some(g => g.id === id)) for (const g of [id, ...descendantsOf(c, id)]) groups.add(g)
    else if (c.objects.some(o => o.id === id)) objects.add(id)
  }
  for (const g of c.groups) if (groups.has(g.id)) for (const o of g.objects) objects.add(o)
  return { groups, objects }
}

// The slots a locked thing is painted from (so rolling leaves their colour alone).
export function lockedSlots(c: ModelContent, objects: ReadonlySet<string>): Set<string> {
  const out = new Set<string>()
  for (const o of c.objects) {
    if (!objects.has(o.id)) continue
    for (const sid of o.shapes) {
      const s = c.shapes.find(x => x.id === sid)
      const slot = s ? paintSource(c, s).slot : null
      if (slot) out.add(slot.id)
    }
  }
  return out
}

export interface RollInput { genre: string | null; locks: readonly string[]; forms: Choices; choices: SlotChoices; palette: ModelSwatch[]; fall?: ModelFallSide }
export interface RollResult { forms: Choices; choices: SlotChoices; fall: ModelFallSide }

const pick = <T,>(list: T[], rng: Rng): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]

export function rollLook(c: ModelContent, rng: Rng, input: RollInput): RollResult {
  const locked = lockedThings(c, input.locks)
  const forms: Choices = { ...input.forms }
  for (const o of c.objects) {
    if (locked.objects.has(o.id)) continue
    for (const a of axesFor(c, o)) if (a.options.length > 0) forms[formKey(o.id, a.id)] = pick(a.options, rng).id
  }
  for (const k of classesOf(c)) {
    const members = membersOf(c, k.id)
    if (!k.exclusive || members.length === 0) continue
    // a family stays as it is when its pattern or any member is locked
    if (locked.objects.has(k.template) || members.some(m => locked.objects.has(m.id))) continue
    forms[classKey(k.id)] = pick(members, rng).id
  }
  const choices = rollChoices(c, rng, input.palette, input.choices, { genre: input.genre, keep: lockedSlots(c, locked.objects) })
  // the side things fall to is rolled too, when something in the model hangs and nothing that hangs is locked (drawn last, so a model with nothing that hangs rolls as it did)
  let fall: ModelFallSide = input.fall ?? 'down'
  const falling = new Set(c.ranges.flatMap(r => r.drives.filter(d => d.kind === 'fall' && d.shape).map(d => d.shape as string)))
  if (falling.size > 0 && !c.objects.some(o => locked.objects.has(o.id) && o.shapes.some(sid => falling.has(sid)))) fall = pick(FALL_SIDES, rng)
  return { forms, choices, fall }
}
