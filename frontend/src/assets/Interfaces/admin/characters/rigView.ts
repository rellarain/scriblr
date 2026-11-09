import type { ModelContent, ModelDrive, ModelGroup, ModelRange } from '../../../../api/types'
import { groupById, groupOfObject, objectById, objectOfShape } from './modelContent'
import type { Selection } from './designerState'
import { valueOf, type Values } from './engine/rig'

// What the Rig and Ranges tabs say about the selection, in plain words. Pure, so it is tested without the page.

// The group a selection is in (a group is its own).
export function groupOfSelection(c: ModelContent, sel: Selection): ModelGroup | undefined {
  if (sel.kind === 'group') return groupById(c, sel.id)
  if (sel.kind === 'object') return groupOfObject(c, sel.id)
  if (sel.kind === 'shape') { const o = objectOfShape(c, sel.id); return o ? groupOfObject(c, o.id) : undefined }
  return undefined
}

// Every id the selection stands for: itself, what is under it, and what it is in.
function related(c: ModelContent, sel: Selection): Set<string> {
  const ids = new Set<string>()
  const addObject = (oid: string) => { ids.add(oid); for (const sid of objectById(c, oid)?.shapes ?? []) ids.add(sid) }
  if (sel.kind === 'group') { ids.add(sel.id); for (const oid of groupById(c, sel.id)?.objects ?? []) addObject(oid) }
  else if (sel.kind === 'object') { addObject(sel.id); const g = groupOfObject(c, sel.id); if (g) ids.add(g.id) }
  else if (sel.kind === 'shape') { ids.add(sel.id); const o = objectOfShape(c, sel.id); if (o) { ids.add(o.id); const g = groupOfObject(c, o.id); if (g) ids.add(g.id) } }
  return ids
}

// The sliders that have to do with the selection: listed under it, or driving it or something in it.
export function rangesForSelection(c: ModelContent, sel: Selection): ModelRange[] {
  if (sel.kind === 'none') return []
  const ids = related(c, sel)
  return c.ranges.filter(r => (r.scope !== null && ids.has(r.scope)) || r.drives.some(d => [d.group, d.id, d.shape].some(x => x !== null && ids.has(x))))
}

// The sliders that turn, scale or anchor a group.
export function rangesMovingGroup(c: ModelContent, groupId: string): ModelRange[] {
  return c.ranges.filter(r => r.drives.some(d => (d.kind === 'turn' && d.group === groupId) || (d.kind === 'scale' && d.target === 'group' && d.id === groupId)) || c.groups.some(g => g.id === groupId && g.attach?.kind === 'range' && g.attach.slider === r.id))
}

const named = (name: string | undefined, id: string | null) => name?.trim() || id || 'something'
const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)

// "Turns Head by -12 degrees at the minimum and +12 at the maximum", for a drive.
export function driveText(c: ModelContent, d: ModelDrive): string {
  if (d.kind === 'turn') return `Turns ${named(groupById(c, d.group ?? '')?.name, d.group)} by ${sign(d.atMin)}° at the minimum and ${sign(d.atMax)}° at the maximum`
  if (d.kind === 'scale') {
    const target = d.target === 'model' ? 'the whole model' : d.target === 'group' ? named(groupById(c, d.id ?? '')?.name, d.id) : named(c.shapes.find(s => s.id === d.id)?.name, d.id)
    const axis = d.axis === 'x' ? ' across' : d.axis === 'y' ? ' up and down' : ''
    return `Scales ${target}${axis} to ${d.atMin}% at the minimum and ${d.atMax}% at the maximum`
  }
  const shape = named(c.shapes.find(s => s.id === d.shape)?.name, d.shape)
  if (d.kind === 'points') return `Moves ${d.moves.length} point${d.moves.length === 1 ? '' : 's'} of ${shape}`
  return `Bends ${shape} by ${sign(d.atMin)}° at the minimum and ${sign(d.atMax)}° at the maximum`
}

// How many sliders stand away from rest.
export function offRest(c: ModelContent, values: Values): number {
  return c.ranges.filter(r => valueOf(r, values) !== r.rest).length
}

// A slider's value as the page writes it: with its unit, no needless decimals.
export function valueText(r: ModelRange, v: number): string {
  const n = Math.round(v * 100) / 100
  return `${n}${r.unit}`
}

// The sliders' test values for one sweep of the scrub: from the minimum up to the maximum and back, as `t` (0..1) goes round once.
export function scrubValue(r: ModelRange, t: number): number {
  const tri = t < 0.5 ? t * 2 : (1 - t) * 2
  return Math.round((r.min + (r.max - r.min) * tri) * 100) / 100
}
