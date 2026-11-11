import type { CharacterFigure, ModelContent, ModelPreset } from '../../../../../api/types'
import { colourById, genresOf, paletteOf, slotById } from '../../../admin/characters/engine/colour'
import { axesFor, classesOf, membersOf, presetsOf } from '../../../admin/characters/engine/forms'
import { clampToSpan } from './figureState'

// Using another model (phase 6b-3): the figure's choices carried onto another model, by id. What the new model has under the same id is kept (a slider at the value it had, held to the
// span the writer may choose within there, a form, a family member, a colour, a swatch, a lock, a style of the writer's own...); what it has not is left behind. The character's own
// palette, the card colour and the side things fall to are the character's and stay. Pure; the figure it gets is not changed.

const r2 = (v: number): number => Math.round(v * 100) / 100

// Whether a form-choice key ("objectId.axisId" or "class:classId") with a value names something the model has.
function formFits(to: ModelContent, key: string, value: string): boolean {
  if (key.startsWith('class:')) {
    const klass = classesOf(to).find(k => k.id === key.slice(6))
    return !!klass && membersOf(to, klass.id).some(m => m.id === value)
  }
  const object = to.objects.find(o => key.startsWith(`${o.id}.`))
  const axis = object ? axesFor(to, object).find(a => a.id === key.slice(object.id.length + 1)) : undefined
  return !!axis && axis.options.some(f => f.id === value)
}

export function carryOver(to: ModelContent, figure: CharacterFigure, key: string): CharacterFigure {
  const ranges = new Map(to.ranges.map(r => [r.id, r]))
  const objects = new Set(to.objects.map(o => o.id)), groups = new Set(to.groups.map(g => g.id))
  const things = new Set([...objects, ...groups, ...to.shapes.map(s => s.id), ...(to.patterns ?? []).map(p => p.id)])
  const palette = figure.palette ?? paletteOf(to)

  const values: Record<string, number> = {}
  for (const [id, v] of Object.entries(figure.values)) {
    const r = ranges.get(id)
    if (!r) continue
    const held = r2(clampToSpan(r, v))
    if (Math.abs(held - r.rest) > 1e-6) values[id] = held
  }
  const forms: Record<string, string> = {}
  for (const [k, v] of Object.entries(figure.forms)) if (formFits(to, k, v)) forms[k] = v
  const colours: CharacterFigure['colours'] = {}
  for (const [slotId, c] of Object.entries(figure.colours)) {
    const slot = slotById(to, slotId)
    if (slot && (c.src === 'swatch' ? palette.some(p => p.id === c.id) : !!colourById(slot, c.id))) colours[slotId] = c
  }
  const zoff: Record<string, number> = {}
  for (const [id, n] of Object.entries(figure.zoff ?? {})) if (objects.has(id)) zoff[id] = n
  const order: Record<string, string[]> = {}
  for (const [id, ids] of Object.entries(figure.order ?? {})) {
    const o = to.objects.find(x => x.id === id)
    const kept = o ? ids.filter(s => o.shapes.includes(s)) : []
    if (kept.length > 0) order[id] = kept
  }
  // A style of the writer's own stays if the part it is for is there; what it sets that is not there is cut.
  const mine: ModelPreset[] = (figure.mine ?? []).flatMap(p => {
    if (!p.scope || !(objects.has(p.scope) || groups.has(p.scope))) return []
    return [{
      ...p,
      values: Object.fromEntries(Object.entries(p.values).filter(([id]) => ranges.has(id))),
      hidden: p.hidden.filter(h => things.has(h)),
      forms: Object.fromEntries(Object.entries(p.forms ?? {}).filter(([k, v]) => formFits(to, k, v))),
    }]
  })
  const presets = new Set([...presetsOf(to).map(p => p.id), ...mine.map(p => p.id)])
  return {
    ...figure, model: key, values, forms, colours, zoff, order, mine,
    hidden: figure.hidden.filter(id => things.has(id)),
    locks: figure.locks.filter(id => objects.has(id) || groups.has(id)),
    genre: figure.genre && genresOf(to).some(g => g.id === figure.genre) ? figure.genre : null,
    on: (figure.on ?? []).filter(id => presets.has(id)),
  }
}
