import type { ModelContent, ModelPlace, ModelPose } from '../../../../../api/types'
import { repairPlace } from './anchors'
import { setTwinTurn, twinSource } from './pivots'
import { resetPose } from './posing'

// Saved poses (slice 9d): a pose kept by name in the model: every pivot point's turn (a twin's own at its original's points, keyed by the twin) and where each figure has been
// placed, so it can be put back. Putting one back puts every other pivot at rest; a pivot the pose does not know (made since) stays at rest; each turn is held to its limits
// as they are now.

export const POSES_MAX = 24
export const POSE_NAME_MAX = 40
const r2 = (v: number): number => Math.round(v * 100) / 100

export const posesOf = (c: ModelContent): ModelPose[] => c.poses ?? []

// The model's pose as it stands now.
export function poseNow(c: ModelContent): { turns: Record<string, number>; places: Record<string, ModelPlace> } {
  const turns: Record<string, number> = {}, places: Record<string, ModelPlace> = {}
  for (const s of c.shapes) {
    s.pts.forEach((p, i) => { const t = p.bind?.pivot?.turn ?? 0; if (t) turns[`${s.id}:${i}`] = t })
    for (const [k, t] of Object.entries(s.twinTurns ?? {})) if (t) turns[`${s.id}:${k}`] = t
  }
  for (const o of c.objects) if (o.place) places[o.id] = o.place
  return { turns, places }
}

// A fresh name for a pose: "Pose n".
export function freshPoseName(c: ModelContent): string {
  const taken = new Set(posesOf(c).map(p => p.name.toLowerCase()))
  for (let n = 1; ; n++) if (!taken.has(`pose ${n}`)) return `Pose ${n}`
}
const freshId = (c: ModelContent): string => { const taken = new Set(posesOf(c).map(p => p.id)); let n = 1; while (taken.has(`pose${n}`)) n++; return `pose${n}` }

// The pose as it stands kept under a name (refused past the limit, or with nothing posed).
export function savePose(c: ModelContent, name: string): { ok: true; content: ModelContent; id: string } | { ok: false; reason: string } {
  if (posesOf(c).length >= POSES_MAX) return { ok: false, reason: `A model keeps at most ${POSES_MAX} poses: delete one first.` }
  const now = poseNow(c)
  if (!Object.keys(now.turns).length && !Object.keys(now.places).length) return { ok: false, reason: 'Nothing is posed: drag the figure into a pose first.' }
  const id = freshId(c), n = name.trim().slice(0, POSE_NAME_MAX) || freshPoseName(c)
  return { ok: true, id, content: { ...c, poses: [...posesOf(c), { id, name: n, ...now }] } }
}

// A saved pose put back.
export function applyPose(c: ModelContent, id: string): ModelContent {
  const pose = posesOf(c).find(p => p.id === id)
  if (!pose) return c
  let w = resetPose(c)
  const byId = new Map(w.shapes.map(s => [s.id, s]))
  for (const [key, turn] of Object.entries(pose.turns)) {
    const [shapeId, k] = key.split(':'), i = Number(k), s = byId.get(shapeId)
    if (!s || !Number.isInteger(i)) continue
    const o = twinSource(w, s)
    if (o) {
      const piv = o.pts[i]?.bind?.pivot
      if (piv) w = setTwinTurn(w, shapeId, i, r2(Math.min(piv.hi, Math.max(piv.lo, turn))))
      continue
    }
    const piv = s.pts[i]?.bind?.pivot
    if (!piv) continue
    const held = r2(Math.min(piv.hi, Math.max(piv.lo, turn)))
    w = { ...w, shapes: w.shapes.map(x => (x.id === shapeId ? { ...x, pts: x.pts.map((p, n) => (n === i && p.bind?.pivot ? { ...p, bind: { ...p.bind, pivot: { ...p.bind.pivot, turn: held } } } : p)) } : x)) }
  }
  const objectIds = new Set(w.objects.map(o => o.id))
  const places = Object.entries(pose.places ?? {}).filter(([oid]) => objectIds.has(oid))
  if (places.length) w = { ...w, objects: w.objects.map(o => { const p = pose.places?.[o.id]; return p ? { ...o, place: p } : o }) }
  return w
}

export const renamePose = (c: ModelContent, id: string, name: string): ModelContent => {
  const n = name.trim().slice(0, POSE_NAME_MAX)
  return n ? { ...c, poses: posesOf(c).map(p => (p.id === id ? { ...p, name: n } : p)) } : c
}
export const deletePose = (c: ModelContent, id: string): ModelContent => ({ ...c, poses: posesOf(c).filter(p => p.id !== id) })

// Poses as the server keeps them: at most 24, each with an id, a name, its turns (keys "shape:point") within a half turn, and its places.
export function repairPoses(v: unknown): ModelPose[] {
  if (!Array.isArray(v)) return []
  const out: ModelPose[] = [], ids = new Set<string>()
  for (const raw of v) {
    if (out.length >= POSES_MAX || !raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    const id = typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(p.id) ? p.id : null
    if (!id || ids.has(id)) continue
    const turns: Record<string, number> = {}
    if (p.turns && typeof p.turns === 'object') {
      for (const [k, t] of Object.entries(p.turns as Record<string, unknown>)) {
        if (/^[A-Za-z0-9_.-]{1,80}:\d{1,4}$/.test(k) && typeof t === 'number' && Number.isFinite(t) && t) turns[k] = r2(Math.min(180, Math.max(-180, t)))
      }
    }
    const places: Record<string, ModelPlace> = {}
    if (p.places && typeof p.places === 'object') {
      for (const [k, q] of Object.entries(p.places as Record<string, unknown>)) { const place = repairPlace(q); if (place && /^[A-Za-z0-9_.-]{1,80}$/.test(k)) places[k] = place }
    }
    ids.add(id)
    out.push({ id, name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, POSE_NAME_MAX) : 'Pose', turns, places })
  }
  return out
}
// The poses a model's content keeps (none: nothing written).
export const posesField = (v: unknown): { poses?: ModelPose[] } => { const poses = repairPoses(v); return poses.length ? { poses } : {} }
