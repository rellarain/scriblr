import type { ModelFallSide, ModelPoint } from '../../../../../api/types'

// Fall (phase 5b): hair, scarves, capes and tails hang under their own weight. A point of a shape may carry a weight (0..1, in steps of a quarter): how free it is
// to hang. A run of consecutive points that have a weight hangs from the unweighted point before it (and, in a closed outline, from the one after it too: the
// run is shared between the two, so both sides of a strip hang). Each segment of a run keeps its length; its direction turns from the way it was drawn toward the
// way things fall, by the point's weight and the strength of the fall. The side things fall to is a test choice (down, the picture's left or right, behind).
// Pure and finite for any input.

export const WEIGHT_STEPS: readonly number[] = [0, 0.25, 0.5, 0.75, 1]
// How far a swing to the left or right leans from straight down, in degrees.
export const FALL_TILT = 36
// How much a fall to the back narrows what hangs (the hair seen from the front, falling behind the head).
export const BEHIND_SQUEEZE = 0.3

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

export const weightOf = (p: Pick<ModelPoint, 'w'>): number => clamp01(p.w ?? 0)

// Which quarter a weight is nearest to (an index into WEIGHT_STEPS).
const stepAt = (w: number | null | undefined): number => {
  const cur = clamp01(w ?? 0)
  let best = 0
  for (let i = 1; i < WEIGHT_STEPS.length; i++) if (Math.abs(WEIGHT_STEPS[i] - cur) < Math.abs(WEIGHT_STEPS[best] - cur)) best = i
  return best
}
// The weight one step up or down the quarters from `w` (held at the ends).
export const stepWeight = (w: number | null | undefined, dir: -1 | 1): number => WEIGHT_STEPS[Math.min(WEIGHT_STEPS.length - 1, Math.max(0, stepAt(w) + dir))]
// The next weight in a click: none, a quarter, half, three quarters, full, and round to none again.
export const cycleWeight = (w: number | null | undefined): number => WEIGHT_STEPS[(stepAt(w) + 1) % WEIGHT_STEPS.length]

// The direction (in the model's space, y down) things fall in: straight down, or leaning to the picture's left or right. From behind the figure is turned round,
// so the picture's left is the model's right.
export function hangDirection(side: ModelFallSide, backView = false): [number, number] {
  let tilt = side === 'left' ? -FALL_TILT : side === 'right' ? FALL_TILT : 0
  if (backView) tilt = -tilt
  const r = (tilt * Math.PI) / 180
  return [Math.sin(r), Math.cos(r)]
}
export const squeezeOf = (side: ModelFallSide): number => (side === 'behind' ? BEHIND_SQUEEZE : 0)

// A run of weighted points. `forward` hangs from `rootA` in outline order, `backward` from `rootB` against it (its first entry is the point next to rootB). A root
// is -1 when the run has none on that side (an open path that ends in the run, or starts with it).
export interface FallRun { rootA: number; rootB: number; forward: number[]; backward: number[] }

function split(rootA: number, rootB: number, run: number[]): FallRun {
  if (rootA < 0) return { rootA, rootB, forward: [], backward: [...run].reverse() }
  if (rootB < 0) return { rootA, rootB, forward: run, backward: [] }
  const k = Math.ceil(run.length / 2)
  return { rootA, rootB, forward: run.slice(0, k), backward: run.slice(k).reverse() }
}

export function fallRuns(list: Array<Pick<ModelPoint, 'w'>>, closed: boolean): FallRun[] {
  const n = list.length
  if (n < 3) return []
  const weighted = (i: number): boolean => weightOf(list[i]) > 0
  let any = false, all = true
  for (let i = 0; i < n; i++) { if (weighted(i)) any = true; else all = false }
  if (!any || all) return []   // nothing is marked, or nothing holds it up
  const out: FallRun[] = []
  if (closed) {
    let start = 0
    while (weighted(start)) start++
    let k = 1
    while (k <= n) {
      if (!weighted((start + k) % n)) { k++; continue }
      const rootA = (start + k - 1) % n, run: number[] = []
      while (weighted((start + k) % n)) { run.push((start + k) % n); k++ }
      out.push(split(rootA, (start + k) % n, run))
    }
  } else {
    let i = 0
    while (i < n) {
      if (!weighted(i)) { i++; continue }
      const rootA = i - 1, run: number[] = []
      while (i < n && weighted(i)) { run.push(i); i++ }
      const rootB = i < n ? i : -1
      if (rootA >= 0 || rootB >= 0) out.push(split(rootA, rootB, run))
    }
  }
  return out
}

// Whether a shape's outline has anything that can hang.
export const hangs = (list: Array<Pick<ModelPoint, 'w'>>, closed: boolean): boolean => fallRuns(list, closed).length > 0

const wrap = (a: number): number => {
  let d = a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d <= -Math.PI) d += 2 * Math.PI
  return d
}

// Let the weighted runs of an outline hang: `strength` 0..1 is how far toward hanging they go, `dir` the unit direction in the outline's own space, `squeeze`
// how much to narrow what hangs across that direction (0 for none). Changes the points in place.
export function applyFall(list: ModelPoint[], closed: boolean, strength: number, dir: [number, number], squeeze = 0): void {
  const s = clamp01(strength)
  if (!(s > 0) || !Number.isFinite(dir[0]) || !Number.isFinite(dir[1])) return
  const len = Math.hypot(dir[0], dir[1])
  if (len < 1e-9) return
  const ux = dir[0] / len, uy = dir[1] / len, target = Math.atan2(uy, ux)
  const was = list.map(p => ({ x: p.x, y: p.y }))
  for (const run of fallRuns(list, closed)) {
    for (const [root, chain] of [[run.rootA, run.forward], [run.rootB, run.backward]] as const) {
      if (root < 0 || chain.length === 0) continue
      let nx = was[root].x, ny = was[root].y   // where the point before is now (a root does not move)
      let px = was[root].x, py = was[root].y   // and where it was drawn
      const moved: number[] = []
      for (const i of chain) {
        const vx = was[i].x - px, vy = was[i].y - py, l = Math.hypot(vx, vy)
        const w = weightOf(list[i]) * s
        const rest = Math.atan2(vy, vx), turn = wrap(target - rest) * w
        if (l > 1e-9) { nx += Math.cos(rest + turn) * l; ny += Math.sin(rest + turn) * l }
        const p = list[i]
        p.x = nx; p.y = ny
        if (turn !== 0) {
          const c = Math.cos(turn), sn = Math.sin(turn)
          if (p.hi) p.hi = [c * p.hi[0] - sn * p.hi[1], sn * p.hi[0] + c * p.hi[1]]
          if (p.ho) p.ho = [c * p.ho[0] - sn * p.ho[1], sn * p.ho[0] + c * p.ho[1]]
        }
        px = was[i].x; py = was[i].y
        moved.push(i)
      }
      // falling behind narrows what hangs, across the way it hangs
      if (squeeze > 0) {
        const rx = was[root].x, ry = was[root].y
        for (const i of moved) {
          const p = list[i], ox = p.x - rx, oy = p.y - ry, across = ox * -uy + oy * ux, k = squeeze * s * weightOf(p)
          p.x -= -uy * across * k; p.y -= ux * across * k
        }
      }
    }
  }
}
