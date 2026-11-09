import type { ModelContent } from '../../../../../api/types'
import { IDENTITY, apply } from './geometry'
import { defaultValues, solve, solveAtRest } from './rig'

// The Rig check: what is probably a mistake in the rig, in plain words, for the Check panel. These are not publish faults (publishFaults has those):
// a slider that drives nothing, a group the anchor moves away from where it was drawn, a slider that sends a shape out of the picture.
export interface CheckLine { level: 'warn' | 'info'; text: string }

const FRAME = { x0: -50, y0: -50, x1: 250, y1: 450 }
const MOVED = 0.5
const MOST_LINES = 8

export function rigCheck(c: ModelContent): CheckLine[] {
  const lines: CheckLine[] = []
  const say = (level: CheckLine['level'], text: string) => { if (lines.length < MOST_LINES) lines.push({ level, text }) }
  const name = (n: string, id: string) => n || id

  // a slider that slides an anchor or loosens the links of a shape is in use even though it drives nothing itself
  const used = new Set([...c.groups.map(g => g.attach?.slider), ...c.shapes.map(s => s.loose)].filter((x): x is string => !!x))
  for (const r of c.ranges) if (r.drives.length === 0 && !used.has(r.id)) say('warn', `Slider ${name(r.name, r.id)} drives nothing yet.`)

  // a group whose anchor does not sit on its pivot is moved by the anchor even at rest: it jumps when it is attached
  const rest = solveAtRest(c)
  for (const g of c.groups) {
    const an = rest.anchors[g.id]
    if (!g.attach || !g.pivot || !an) continue
    const pm = (g.parent ? rest.mats[g.parent] : undefined) ?? IDENTITY, pw = apply(pm, g.pivot[0], g.pivot[1])
    if (Math.hypot(an[0] - pw[0], an[1] - pw[1]) > MOVED) say('warn', `Group ${name(g.name, g.id)} is moved by its anchor at rest: its pivot is not on the anchor.`)
  }

  // a slider at either end must leave every shape inside the picture
  const base = defaultValues(c)
  for (const r of c.ranges) {
    if (r.drives.length === 0) continue
    for (const end of ['min', 'max'] as const) {
      const out = solve(c, { ...base, [r.id]: r[end] })
      const bad = Object.values(out.shapes).find(s => s.visible && (s.box.x < FRAME.x0 || s.box.y < FRAME.y0 || s.box.x + s.box.w > FRAME.x1 || s.box.y + s.box.h > FRAME.y1))
      if (bad) { say('warn', `Slider ${name(r.name, r.id)} at its ${end === 'min' ? 'minimum' : 'maximum'} sends ${name(c.shapes.find(s => s.id === bad.id)?.name ?? '', bad.id)} outside the picture.`); break }
    }
  }
  return lines
}

// What is worth knowing about forms, as plain information (not mistakes): a form that changes a shape which has an outline of its own for the back view shows
// from the front only, and a form whose outline has another number of points than the base is followed by anchors, links and recorded moves by the base.
export function formCheck(c: ModelContent): CheckLine[] {
  const lines: CheckLine[] = []
  const say = (text: string) => { if (lines.length < MOST_LINES) lines.push({ level: 'info', text }) }
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  for (const o of c.objects) {
    for (const a of o.axes ?? []) {
      for (const f of a.options) {
        for (const v of f.ovr) {
          const s = shapes.get(v.shape)
          if (!s) continue
          const label = `${f.name || f.id} (${a.name || a.id} of ${o.name || o.id}) changes ${s.name || s.id}`
          if ((s.back?.length ?? 0) >= 3) say(`${label}, which has an outline of its own for the back: the form shows from the front only.`)
          if (v.pts.length >= 3 && v.pts.length !== s.pts.length) say(`${label} with ${v.pts.length} points where the base has ${s.pts.length}: anchors, links and sliders follow the base outline.`)
        }
      }
    }
  }
  return lines
}
