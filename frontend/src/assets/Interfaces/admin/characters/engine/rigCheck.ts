import type { ModelContent } from '../../../../../api/types'
import { IDENTITY, apply } from './geometry'
import { isUsed } from './paintEdit'
import { boneAtRest, defaultValues, solve, solveAtRest } from './rig'
import { fitOf } from './fitEdit'
import { wearsRoundInACircle } from './wear'
import { hangs, weightOf } from './fall'
import { paintOrigin } from './colour'
import { PROPS, type PropKey } from './props'

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

// What is worth knowing about paint effects (phase 4b), as plain information: a helper shape that nothing clips to or is cut by is never drawn and does nothing, and a
// shading shape in an object with no base shape to lie on is not drawn either.
// What objects are worn under (phase 6b): two garments that are each worn under the other (or a longer circle) trim each other to nothing much.
export function wearCheck(c: ModelContent): CheckLine[] {
  const lines: CheckLine[] = []
  for (const o of c.objects) {
    if (lines.length >= MOST_LINES) break
    if (wearsRoundInACircle(c, o)) lines.push({ level: 'warn', text: `${o.name || o.id} is worn under something that is worn under it: they trim each other.` })
  }
  return lines
}

export function paintCheck(c: ModelContent): CheckLine[] {
  const lines: CheckLine[] = []
  const say = (text: string) => { if (lines.length < MOST_LINES) lines.push({ level: 'info', text }) }
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  for (const s of c.shapes) {
    if (s.helper === true && !s.mirrorOf && !isUsed(c, s.id) && !c.shapes.some(t => t.mirrorOf === s.id)) say(`${s.name || s.id} is a helper shape, but nothing is clipped to it or cut by it: it is never drawn.`)
  }
  for (const o of c.objects) {
    const mine = o.shapes.map(id => shapes.get(id)).filter((s): s is NonNullable<typeof s> => !!s)
    if (mine.some(s => s.shade) && !mine.some(s => !s.shade && !s.helper)) say(`${o.name || o.id} has shading but no base shape for it to lie on: the shading is not drawn.`)
  }
  return lines
}

// What is worth knowing about proportions (phase 5a), as plain information: a bone with no length at rest cannot be stretched by a Length slider, an object that
// does not scale with its group is drawn differently from the outline anchors and links read, and a slider whose writer's limit leaves only the resting value
// gives the writer no choice.
export function proportionCheck(c: ModelContent): CheckLine[] {
  const lines: CheckLine[] = []
  const say = (text: string) => { if (lines.length < MOST_LINES) lines.push({ level: 'info', text }) }
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  for (const b of c.bones ?? []) {
    const e = boneAtRest(c, b)
    if (e && Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) < 0.5) say(`Bone ${b.name || b.id} has no length at rest: a Length slider cannot stretch it.`)
  }
  for (const o of c.objects) {
    const mode = fitOf(o)
    if (o.mirrorOf || mode === 'scale') continue
    const target = mode === 'stretch' && o.fitTo ? shapes.get(o.fitTo) : undefined
    say(`${o.name || o.id} ${mode === 'keep' ? 'keeps its size' : `stretches to ${target ? target.name || target.id : 'a shape'}`}: its anchors and links read the outline as its group holds it, not as it is drawn.`)
  }
  for (const r of c.ranges) {
    if (r.limit && r.limit[0] >= r.rest && r.limit[1] <= r.rest) say(`Slider ${r.name || r.id} lets a writer choose only its resting value.`)
  }
  return lines
}

// What is worth knowing about bridges, creases and fall (phase 5b), as plain information: a point set to leave along its edge with no partner does nothing, a
// shape that is set to fall but has nothing that can hang (no weighted run), weights that nothing lets fall, and a crease whose two ends are the same value.
export function hangCheck(c: ModelContent): CheckLine[] {
  const lines: CheckLine[] = []
  const say = (text: string) => { if (lines.length < MOST_LINES) lines.push({ level: 'info', text }) }
  const falling = new Set(c.ranges.flatMap(r => r.drives.filter(d => d.kind === 'fall' && d.shape).map(d => d.shape as string)))
  for (const s of c.shapes) {
    const name = s.name || s.id
    if (s.mirrorOf) continue
    const n = s.pts.length
    for (let i = 0; i < n; i++) {
      const b = s.pts[i].bind
      if (b?.kind !== 'edge' || !b.tan) continue
      const next = s.pts[(i + 1) % n].bind, prev = s.pts[(i + n - 1) % n].bind
      const pairs = (o: typeof next) => o?.kind === 'edge' && o.tan === true && o.s !== b.s
      if (!(pairs(next) && (s.closed || i + 1 < n)) && !(pairs(prev) && (s.closed || i > 0))) say(`Point ${i + 1} of ${name} leaves along its edge, but the points beside it are not locked to another shape that way: it has no effect.`)
    }
    const weighted = s.pts.some(p => weightOf(p) > 0)
    if (falling.has(s.id) && !hangs(s.pts, s.closed)) say(weighted ? `${name} is set to fall, but every point of it carries a weight, so nothing holds it up.` : `${name} is set to fall, but no point of it carries a weight: use the Weights tool to mark the points that hang.`)
    else if (weighted && !falling.has(s.id)) say(`${name} has weighted points, but no slider lets it fall.`)
    if (s.opBy && s.opBy.hidden === s.opBy.shown) say(`${name} shows with a slider whose two ends are the same value: it switches on at once.`)
  }
  return lines
}

// What is worth knowing about authored fields (phase D3c), as plain information: a field that changes the gradient of a shape that has none (or the direction of a radial
// one, which has none) draws nothing different, and a field whose two ends and rest are the same amount changes nothing.
export function fieldCheck(c: ModelContent): CheckLine[] {
  const lines: CheckLine[] = []
  const say = (text: string) => { if (lines.length < MOST_LINES) lines.push({ level: 'info', text }) }
  const shapes = new Map(c.shapes.map(s => [s.id, s])), objects = new Map(c.objects.map(o => [o.id, o]))
  const gradientOf = (id: string) => { const s = shapes.get(id); return s && !s.shade ? paintOrigin(c, s).shape.grad ?? null : null }
  for (const r of c.ranges) {
    const name = r.name || r.id
    for (const d of r.drives) {
      if (d.kind !== 'prop' || !d.prop || !(d.prop in PROPS)) continue
      const spec = PROPS[d.prop as PropKey]
      if (Math.abs(d.atMin - spec.rest) < 1e-9 && Math.abs(d.atMax - spec.rest) < 1e-9) say(`Field ${name} changes nothing: ${spec.label.toLowerCase()} is the same at both ends of the slider.`)
      if (!d.prop.startsWith('grad')) continue
      const ids = d.feature === 'object' ? objects.get(d.id ?? '')?.shapes ?? [] : d.shape ? [d.shape] : []
      const grads = ids.map(gradientOf).filter((g): g is NonNullable<typeof g> => !!g)
      const where = d.feature === 'object' ? objects.get(d.id ?? '')?.name || d.id : shapes.get(d.shape ?? '')?.name || d.shape
      if (grads.length === 0) say(`Field ${name} changes the gradient of ${where}, which has none: it has no effect.`)
      else if (d.prop === 'gradDir' && grads.every(g => g.dir === 'radial')) say(`Field ${name} turns the direction of the gradient of ${where}, which is radial: it has no effect.`)
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
