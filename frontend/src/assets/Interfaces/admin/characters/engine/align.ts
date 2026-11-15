import type { ModelContent } from '../../../../../api/types'
import { anchorsOf } from './anchors'
import { connectedSet } from './connect'
import { moveShape } from './edit'
import { inverse } from './geometry'
import { shapeById, updateShape } from '../modelContent'
import type { Solved } from './rig'

// Align across / Align down in the shape editor (a shape, an object or a group): the shapes and every shape connected to them (links either way, through any number of
// shapes) move together so the box around them is centred on the middle of the model, keeping their arrangement. Mirrors and clones are left out: they follow their
// originals.

export type AlignResult = { ok: true; content: ModelContent } | { ok: false; reason: string }

// The shapes that move: every shape connected to any seed, the seeds too, without mirrors, clones and shapes with no points.
export function alignSet(c: ModelContent, seeds: string[]): string[] {
  const out = new Set<string>()
  for (const id of seeds) for (const s of connectedSet(c, id)) out.add(s)
  return [...out].filter(id => { const s = shapeById(c, id); return !!s && !s.mirrorOf && !s.cloneOf && s.pts.length > 0 })
}

// `centre`: where the middle goes on the canvas along that axis (the model's middle line across, or its middle down).
export function alignConnected(c: ModelContent, solved: Solved, seeds: string[], axis: 'x' | 'y', centre: number): AlignResult {
  const ids = alignSet(c, seeds).filter(id => (solved.shapes[id]?.poly.length ?? 0) > 0)
  if (!ids.length) return { ok: false, reason: 'Nothing here to align.' }
  const pinned = ids.map(id => shapeById(c, id)).find(s => !!s && anchorsOf(s).length > 0)
  if (pinned) return { ok: false, reason: `${pinned.name.trim() || 'A shape'} is anchored${ids.length > 1 ? ', and the others are connected to it' : ''}: ${ids.length > 1 ? 'they' : 'it'} cannot be aligned.` }
  let lo = Infinity, hi = -Infinity
  for (const id of ids) for (const [x, y] of solved.shapes[id].poly) { const v = axis === 'x' ? x : y; lo = Math.min(lo, v); hi = Math.max(hi, v) }
  const d = centre - (lo + hi) / 2
  if (Math.abs(d) < 1e-6) return { ok: true, content: c }
  const wx = axis === 'x' ? d : 0, wy = axis === 'y' ? d : 0
  let next = c
  for (const id of ids) {
    const iv = inverse(solved.shapes[id].matrix)
    next = updateShape(next, id, s => moveShape(s, iv[0] * wx + iv[2] * wy, iv[1] * wx + iv[3] * wy))
  }
  return { ok: true, content: next }
}
