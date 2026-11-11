// The hair of the seed model: the mockup's sections of the head by plane (front, top, left side, right side, back, nape) and side (left, centre, right). Each section is its own
// object: a piece rooted on the edge of the head (its roots are locked to the skull), with a cut (its shape, as forms), a Length and a Texture slider and, behind the head, a
// shadow. A hairstyle is a preset of the sections: how long each is, how it is waved, its cut, and which are left off.
import type { ModelDrive, ModelGroup, ModelObject, ModelPoint, ModelPreset, ModelRange, ModelShape } from '../../src/api/types'
import { nearestEdge, r2 } from '../../src/assets/Interfaces/admin/characters/engine/geometry'
import { drive, range, shapeOf } from './body'

const PLANE_NAMES: Record<string, string> = { front: 'Front', top: 'Top', left: 'Left side', right: 'Right side', back: 'Back', nape: 'Nape' }
const SIDE_NAMES: Record<string, string> = { left: 'left', center: 'centre', right: 'right' }
export const CELLS: Array<[string, string]> = [['front', 'center'], ['front', 'left'], ['front', 'right'], ['top', 'center'], ['top', 'left'], ['top', 'right'], ['left', 'center'], ['right', 'center'], ['back', 'center'], ['back', 'left'], ['back', 'right'], ['nape', 'center'], ['nape', 'left'], ['nape', 'right']]

// How long each plane is drawn at rest (the default look: short hair); a section's slider runs from its own least to its most.
const REST: Record<string, number> = { front: 55, top: 70, left: 14, right: 14, back: 28, nape: 18 }

const cellId = (plane: string, side: string): string => `${plane}.${side}`
const objectId = (plane: string, side: string): string => `hair.${cellId(plane, side)}`
const shapeId = (plane: string, side: string): string => `hr_${plane}_${side}`
const shadeId = (plane: string, side: string): string => `hs_${plane}_${side}`
export const lengthId = (plane: string, side: string): string => `len_${plane}_${side}`
export const textureId = (plane: string, side: string): string => `tex_${plane}_${side}`
const titleOf = (plane: string, side: string): string => (plane === 'left' || plane === 'right' ? PLANE_NAMES[plane] : `${PLANE_NAMES[plane]}, ${SIDE_NAMES[side]}`)

// The roots of a section are locked to the edge of the skull at the place they were drawn: the mockup's skull is another list of points, so its edge numbers do not carry over.
function relock(pts: ModelPoint[], skull: ModelPoint[]): ModelPoint[] {
  return pts.map(p => {
    if (!p.bind || p.bind.kind !== 'edge') return p
    const hit = nearestEdge(skull, p.x, p.y)
    if (!hit) return p
    return { ...p, bind: { ...p.bind, s: 'skull', e: hit.e, t: r2(hit.t) } }
  })
}

const rest0 = (plane: string, def: number): number => REST[plane] / def - 1

// A section stretched from its roots the way the Length slider does it (so the rest value of the slider is the length the outline is drawn at).
function stretched(pts: ModelPoint[], root: number, f: number): ModelPoint[] {
  return pts.map(p => ((p.w ?? 0) > 0 ? { ...p, y: r2(p.y + (p.y - root) * f * (p.w ?? 0)) } : p))
}
const rootOf = (pts: ModelPoint[]): number => {
  const roots = pts.filter(p => !((p.w ?? 0) > 0))
  return roots.length ? roots.reduce((n, p) => n + p.y, 0) / roots.length : 0
}

export interface Hair { shapes: ModelShape[]; objects: ModelObject[]; group: ModelGroup; ranges: ModelRange[]; presets: ModelPreset[] }

export function hairParts(mock: any, skull: ModelPoint[]): Hair {
  const shapes: ModelShape[] = [], objects: ModelObject[] = [], ranges: ModelRange[] = []
  const fallDrives: ModelDrive[] = []
  for (const [plane, side] of CELLS) {
    const oid = objectId(plane, side), pid = shapeId(plane, side), sid = shadeId(plane, side), title = titleOf(plane, side)
    const src = mock.shapes[pid], mockRange = mock.ranges.find((r: any) => r.id === `len:${cellId(plane, side)}`)
    if (!src || !mockRange) throw new Error(`the mockup has no hair section ${plane} ${side}`)
    // A section's length is a value of its slider: the value `def` is the piece as the mockup drew it, and the piece is as long as the value is to `def` (so 0 is no hair at all);
    // the outline is drawn at `rest`, and the slider stretches it from there by value / rest (a prop amount of at most 1000 percent, so the most is held to ten times the rest).
    const f = rest0(plane, mockRange.def)
    const rest = REST[plane]
    const least = plane === 'left' || plane === 'right' ? 0 : mockRange.min
    const most = Math.min(mockRange.max, Math.floor(rest * 9.9))
    const base = shapeOf(mock, pid, { name: `Hair piece: ${title}`, zBack: src.zBack ?? null, slot: 'k_hair' })
    const root = rootOf(relock(base.pts, skull))
    const bake = (pts: ModelPoint[]): ModelPoint[] => stretched(relock(pts, skull), root, f)
    shapes.push({ ...base, pts: bake(base.pts) })
    const ids = [pid]
    if (mock.shapes[sid]) {
      const sh = mock.shapes[sid]
      const shade = shapeOf(mock, sid, { name: `Hair shade: ${title}`, zBack: sh.zBack ?? null, slot: 'k_hair', op: sh.op ?? 0.45, shade: { kind: 'shadow', t: sh.shade?.t ?? 0.22 } })
      shapes.push({ ...shade, pts: stretched(shade.pts, root, f) })
      ids.push(sid)
    }
    const cut = mock.objects[oid].axes[0]
    objects.push({
      id: oid, name: `Hair: ${title}`, layer: 'hair', shapes: ids,
      axes: [{
        id: 'cut', name: 'Cut', initial: cut.def, roll: 0, options: cut.options.map((o: any) => {
          const ovr = o.ovr?.[pid]
          return { id: o.id, name: o.name, ovr: ovr ? [{ shape: pid, pts: bake(shapeOfPoints(mock, ovr)) }] : [] }
        }),
      }],
    })
    // Randomise leaves a section's length and texture where they are: a hairstyle sets them together, and rolled one by one they would make a different cut of every section
    ranges.push(range(lengthId(plane, side), 'Length', oid, least, rest, most, '%', [drive({ kind: 'prop', feature: 'object', id: oid, prop: 'length', atMin: r2((100 * least) / rest), atMax: r2((100 * most) / rest) })], { rand: [rest, rest] }))
    ranges.push(range(textureId(plane, side), 'Texture', oid, 0, 0, 99, '', [drive({ kind: 'prop', feature: 'object', id: oid, prop: 'texture', atMin: 0, atMax: 99 })], { rand: [0, 0] }))
    if (plane === 'back' || plane === 'left' || plane === 'right') for (const id of ids) fallDrives.push(drive({ kind: 'fall', shape: id, atMin: 0, atMax: 100 }))
  }
  ranges.push(range('hairFall', 'Hair fall', 'hair', 0, 0, 100, '%', fallDrives))
  const group: ModelGroup = { id: 'hair', name: 'Hair', parent: 'head', objects: objects.map(o => o.id), pivot: [100, 54], attach: null }
  return { shapes, objects, group, ranges, presets: hairStyles() }
}

// The points of a form of a section, which the mockup keeps as lists of its own points.
function shapeOfPoints(mock: any, list: any[]): ModelPoint[] {
  const holder = { shapes: { tmp: { id: 'tmp', name: 'tmp', pts: list, z: 0, op: 1 } } }
  return shapeOf(holder, 'tmp').pts
}

// ---- hairstyles ----

interface Style { id: string; name: string; len: Record<string, number>; tex: number; cut: string; off?: string[] }
const STYLES: Style[] = [
  { id: 'short', name: 'Short', len: {}, tex: 0, cut: 'blunt' },
  { id: 'buzz', name: 'Buzzed', len: { front: 14, top: 22, left: 12, right: 12, back: 12, nape: 12 }, tex: 0, cut: 'blunt' },
  { id: 'pixie', name: 'Pixie', len: { front: 80, top: 130, left: 28, right: 28, back: 28, nape: 20 }, tex: 33, cut: 'layered' },
  { id: 'undercut', name: 'Undercut', len: { front: 140, top: 170, left: 14, right: 14, back: 26, nape: 14 }, tex: 33, cut: 'blunt', off: ['left.center', 'right.center', 'nape.left', 'nape.center', 'nape.right'] },
  { id: 'mohawk', name: 'Mohawk', len: { front: 110, top: 260, back: 70, nape: 40, 'front.left': 10, 'front.right': 10, 'top.left': 10, 'top.right': 10, 'back.left': 10, 'back.right': 10, 'nape.left': 10, 'nape.right': 10 }, tex: 0, cut: 'taper', off: ['left.center', 'right.center'] },
  { id: 'shaved', name: 'Shaved on one side', len: { front: 100, top: 110, left: 100, right: 100, back: 112, 'back.left': 26, nape: 90 }, tex: 33, cut: 'blunt', off: ['left.center', 'nape.left'] },
  { id: 'bob', name: 'Bob', len: { front: 100, top: 90, left: 60, right: 60, back: 58, nape: 45 }, tex: 0, cut: 'round' },
  { id: 'shoulder', name: 'Shoulder-length', len: { front: 90, top: 80, left: 80, right: 80, back: 90, nape: 70 }, tex: 0, cut: 'blunt' },
  { id: 'long', name: 'Long and straight', len: { front: 100, top: 80, left: 95, right: 95, back: 125, nape: 100 }, tex: 0, cut: 'blunt' },
  { id: 'wavy', name: 'Long and wavy', len: { front: 100, top: 80, left: 95, right: 95, back: 125, nape: 100 }, tex: 33, cut: 'round' },
  { id: 'curls', name: 'Curls', len: { front: 100, top: 150, left: 90, right: 90, back: 110, nape: 90 }, tex: 66, cut: 'round' },
  { id: 'coils', name: 'Coils', len: { front: 80, top: 120, left: 70, right: 70, back: 80, nape: 70 }, tex: 99, cut: 'round' },
  { id: 'afro', name: 'Afro', len: { front: 125, top: 290, left: 140, right: 140, back: 110, nape: 110 }, tex: 99, cut: 'round' },
  { id: 'bald', name: 'Bald', len: {}, tex: 0, cut: 'blunt', off: CELLS.map(([p, s]) => cellId(p, s)) },
]

function hairStyles(): ModelPreset[] {
  return STYLES.map(st => {
    const values: Record<string, number> = {}, forms: Record<string, string> = {}
    for (const [plane, side] of CELLS) {
      const cell = cellId(plane, side)
      const len = st.len[cell] ?? st.len[plane]
      if (len != null && Math.abs(len - REST[plane]) > 0.01) values[lengthId(plane, side)] = len
      if (st.tex !== 0) values[textureId(plane, side)] = st.tex
      if (st.cut !== 'blunt') forms[`${objectId(plane, side)}.cut`] = st.cut
    }
    return { id: `hair_${st.id}`, name: st.name, kind: 'Hair style', values, hidden: (st.off ?? []).map(c => `hair.${c}`), forms }
  })
}
