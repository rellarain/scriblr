import type { MapBiomeGroup, MapDoc, MapProfile, MapShape } from '../../../../api/types'
import { resolveBiome, type BiomeIndex } from './mapBiomes'
import { heightRangeOf, levelDef } from './mapLevels'
import { flatten } from './mapShapes'

// Heights of the land. The base has a height (the sea floor of a planet, the plain of a region); each biome shape, drawn in order, changes the height of
// what is under it: it sets it, raises it or lowers it by its height, or keeps it, spread over the shape by its profile. Land does not lie under the sea
// unless it is lowered there: a biome of land (not water) drawn over a height below sea level comes up to sea level first, so an island drawn on the ocean
// is an island, and a forest drawn over a mountain keeps the mountain's height. A shape with no biome of its own only changes the height.
//
// The heights are worked out on a grid of samples (up to four a cell, about a million at most), cached per draft, and give the shading (lighter higher,
// darker lower), the relief (light from the upper left), the contour lines and the readout under the pointer. All of it is pure, so it is tested in node.

// The height of land under a shape at its full weight (a plateau with no slope): the rule the grid applies at each sample.
export function landHeight(under: number, shape: Pick<MapShape, 'heightMode' | 'height' | 'biome'>, group: MapBiomeGroup | null, weight = 1): number {
  const h = shape.height ?? 0
  const lifted = shape.biome && group !== 'water' ? Math.max(under, 0) : under
  switch (shape.heightMode) {
    case 'set': return lifted + (h - lifted) * weight
    case 'raise': return lifted + h * weight
    case 'lower': return lifted - h * weight
    default: return lifted
  }
}

// How much of a shape's height change applies at a point `d` cells in from its edge, when its deepest point is `dmax` cells in. A plateau is flat, with a
// ramp `slope` cells wide at its edge (none: a step); a hill rises smoothly over `slope` cells (0: to its deepest point); a peak rises straight to its
// deepest point; a basin is steep at the edge and flat in the middle (a bowl when it lowers the land, a dome when it raises it).
export function profileWeight(profile: MapProfile | undefined, d: number, dmax: number, slope = 0): number {
  if (!(d > 0)) return 0
  const reach = slope > 0 ? Math.min(slope, Math.max(dmax, 1e-6)) : Math.max(dmax, 1e-6)
  const t = Math.min(1, d / reach)
  switch (profile) {
    case 'hill': return t * t * (3 - 2 * t)
    case 'peak': return Math.min(1, d / Math.max(dmax, 1e-6))
    case 'basin': return 1 - (1 - t) * (1 - t)
    default: return slope > 0 ? Math.min(1, d / slope) : 1
  }
}

// The height that reads lightest (the same depth reads darkest): the map's own, or its level's. 0 = not shaded by height (space, buildings).
export function mapHeightRange(draft: Pick<MapDoc, 'level' | 'units' | 'heightRange'>): number {
  if (levelDef(draft.level).drawn !== 'biomes') return 0
  return draft.heightRange && draft.heightRange > 0 ? draft.heightRange : heightRangeOf(draft.level, draft.units)
}

export interface HeightGrid {
  // Samples across and down, samples a cell, and the heights row by row (sample (i, j) is at ((i + 0.5) / s, (j + 0.5) / s) in cells).
  w: number; h: number; s: number
  data: Float32Array
  min: number; max: number
}

export const MAX_SAMPLES = 1_000_000

export function samplesPerCell(width: number, height: number): number {
  return Math.max(1, Math.min(4, Math.floor(Math.sqrt(MAX_SAMPLES / Math.max(1, width * height)))))
}

// The samples inside a closed outline (even-odd), in the box of samples it covers.
interface Mask { x0: number; y0: number; w: number; h: number; inside: Uint8Array }
function maskOf(poly: Array<{ x: number; y: number }>, s: number, gw: number, gh: number): Mask | null {
  if (poly.length < 3) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of poly) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }
  const x0 = Math.max(0, Math.floor(minX * s - 0.5)), x1 = Math.min(gw - 1, Math.ceil(maxX * s - 0.5))
  const y0 = Math.max(0, Math.floor(minY * s - 0.5)), y1 = Math.min(gh - 1, Math.ceil(maxY * s - 0.5))
  if (x1 < x0 || y1 < y0) return null
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const inside = new Uint8Array(w * h)
  const xs: number[] = []
  for (let j = 0; j < h; j += 1) {
    const y = (y0 + j + 0.5) / s
    xs.length = 0
    for (let k = 0, n = poly.length; k < n; k += 1) {
      const a = poly[k], b = poly[(k + 1) % n]
      if ((a.y <= y) !== (b.y <= y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // Samples whose centre lies between the two crossings.
      const from = Math.max(0, Math.ceil(xs[k] * s - 0.5) - x0), to = Math.min(w - 1, Math.floor(xs[k + 1] * s - 0.5) - x0)
      for (let i = from; i <= to; i += 1) inside[j * w + i] = 1
    }
  }
  return { x0, y0, w, h, inside }
}

// How far each sample of a mask is from its edge, in samples (a 3-4 chamfer, so about 3 a sample across, 4 diagonally), and the deepest.
function distances(m: Mask): { dist: Float32Array; max: number } {
  const W = m.w + 2, H = m.h + 2
  const d = new Float32Array(W * H)
  for (let j = 0; j < m.h; j += 1) for (let i = 0; i < m.w; i += 1) if (m.inside[j * m.w + i]) d[(j + 1) * W + i + 1] = 1e9
  for (let y = 1; y < H - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const k = y * W + x
      if (d[k] === 0) continue
      d[k] = Math.min(d[k], d[k - 1] + 3, d[k - W] + 3, d[k - W - 1] + 4, d[k - W + 1] + 4)
    }
  }
  let max = 0
  for (let y = H - 2; y >= 1; y -= 1) {
    for (let x = W - 2; x >= 1; x -= 1) {
      const k = y * W + x
      if (d[k] === 0) continue
      d[k] = Math.min(d[k], d[k + 1] + 3, d[k + W] + 3, d[k + W + 1] + 4, d[k + W - 1] + 4)
      if (d[k] > max) max = d[k]
    }
  }
  return { dist: d, max }
}

// The heights of a map: the base, then each biome shape of its biomes layer in order. None when the map is not drawn as land (space, buildings).
export function buildHeights(draft: Pick<MapDoc, 'width' | 'height' | 'base' | 'shapes' | 'layers' | 'level' | 'units' | 'heightRange'>, biomes: BiomeIndex): HeightGrid | null {
  if (mapHeightRange(draft) <= 0) return null
  const s = samplesPerCell(draft.width, draft.height)
  const W = draft.width * s, H = draft.height * s
  const data = new Float32Array(W * H).fill(draft.base.height)
  const land = new Set(draft.layers.filter(l => l.kind === 'terrain').map(l => l.id))
  for (const shape of draft.shapes) {
    if (shape.type !== 'biome' || !land.has(shape.layerId)) continue
    const m = maskOf(flatten(shape), s, W, H)
    if (!m) continue
    const group = shape.biome ? resolveBiome(biomes, shape.biome).group : null
    const mode = shape.heightMode ?? 'none'
    // A flat change (no spread) needs no distances.
    const flat = mode === 'none' || ((shape.profile ?? 'plateau') === 'plateau' && !(shape.slope && shape.slope > 0))
    const far = flat ? null : distances(m)
    const dmax = far ? far.max / 3 / s : 0
    for (let j = 0; j < m.h; j += 1) {
      for (let i = 0; i < m.w; i += 1) {
        if (!m.inside[j * m.w + i]) continue
        const k = (m.y0 + j) * W + m.x0 + i
        let weight = 1
        if (far) {
          const d = (far.dist[(j + 1) * (m.w + 2) + i + 1] / 3 - 0.5) / s
          weight = profileWeight(shape.profile, Math.max(d, 0.5 / s), dmax, shape.slope ?? 0)
        }
        data[k] = landHeight(data[k], shape, group, weight)
      }
    }
  }
  let min = Infinity, max = -Infinity
  for (let k = 0; k < data.length; k += 1) { if (data[k] < min) min = data[k]; if (data[k] > max) max = data[k] }
  return { w: W, h: H, s, data, min, max }
}

// The height at a point of the map (in cells): the sample it falls in.
export function heightAt(grid: HeightGrid, x: number, y: number): number {
  const i = Math.max(0, Math.min(grid.w - 1, Math.floor(x * grid.s)))
  const j = Math.max(0, Math.min(grid.h - 1, Math.floor(y * grid.s)))
  return grid.data[j * grid.w + i]
}

// ---- shading ----

// How much lighter (> 0) or darker (< 0) a height makes the land: up to MAX_TINT at the height range.
export const MAX_TINT = 0.55
// How strong the relief is: a rise of the whole height range over this many cells faces the light at 45 degrees.
export const RELIEF_CELLS = 6
const LIGHT = (() => { const v = [-1, -1, 1.4]; const n = Math.hypot(v[0], v[1], v[2]); return v.map(c => c / n) })()

export function heightTint(height: number, range: number): number {
  if (!(range > 0) || !Number.isFinite(height) || height === 0) return 0
  return Math.max(-1, Math.min(1, height / range)) * MAX_TINT
}

// The shading over the land, one RGBA pixel a sample: white where it is higher than sea level, black where lower, as strong as the height (and, with
// relief, lighter on slopes that face the upper left and darker on those that face away).
export function shadePixels(grid: HeightGrid, range: number, relief: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(grid.w * grid.h * 4)
  const { w, h, s, data } = grid
  const scale = range > 0 ? (RELIEF_CELLS / range) * (s / 2) : 0
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const k = j * w + i
      let v = heightTint(data[k], range)
      if (relief && scale > 0) {
        const gx = (data[j * w + Math.min(w - 1, i + 1)] - data[j * w + Math.max(0, i - 1)]) * scale
        const gy = (data[Math.min(h - 1, j + 1) * w + i] - data[Math.max(0, j - 1) * w + i]) * scale
        const n = Math.hypot(gx, gy, 1)
        const lit = (-gx * LIGHT[0] - gy * LIGHT[1] + LIGHT[2]) / n
        v += (lit - LIGHT[2]) * 0.9
      }
      v = Math.max(-0.8, Math.min(0.8, v))
      const p = k * 4
      const c = v > 0 ? 255 : 0
      out[p] = c; out[p + 1] = c; out[p + 2] = c
      out[p + 3] = Math.round(Math.abs(v) * 255)
    }
  }
  return out
}

// ---- contours ----

// The distance between contour lines: a round number (1, 2 or 5 times a power of ten) about a quarter of the height range.
export function contourStep(range: number): number {
  if (!(range > 0)) return 0
  const raw = range / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

export interface ContourSegment { x1: number; y1: number; x2: number; y2: number; index: boolean }
export const MAX_CONTOUR_SEGMENTS = 200_000

// The contour lines of a grid (marching squares between the sample centres), every `step`; every fifth (and sea level) is an index line. In cells.
export function contourLines(grid: HeightGrid, step: number): ContourSegment[] {
  const out: ContourSegment[] = []
  if (!(step > 0) || grid.max - grid.min < step * 0.01) return out
  const { w, h, s, data } = grid
  const at = (i: number, j: number) => data[j * w + i]
  for (let j = 0; j + 1 < h; j += 1) {
    for (let i = 0; i + 1 < w; i += 1) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d)
      if (hi - lo < 1e-9) continue
      // A corner exactly on a level counts as above it, so land at sea level next to the sea draws the coastline.
      for (let level = Math.ceil(lo / step) * step; level <= hi; level += step) {
        const cut = (p: number, q: number) => (level - p) / (q - p)
        const up = (v: number) => v >= level
        const code = (up(a) ? 8 : 0) | (up(b) ? 4 : 0) | (up(c) ? 2 : 0) | (up(d) ? 1 : 0)
        if (code === 0 || code === 15) continue
        // The points where the level crosses each side of the square (top, right, bottom, left), in samples.
        const top = (): [number, number] => [i + cut(a, b), j]
        const right = (): [number, number] => [i + 1, j + cut(b, c)]
        const bottom = (): [number, number] => [i + 1 - cut(c, d), j + 1]
        const left = (): [number, number] => [i, j + 1 - cut(d, a)]
        const pairs: Array<[[number, number], [number, number]]> = []
        switch (code) {
          case 1: case 14: pairs.push([left(), bottom()]); break
          case 2: case 13: pairs.push([bottom(), right()]); break
          case 3: case 12: pairs.push([left(), right()]); break
          case 4: case 11: pairs.push([top(), right()]); break
          case 6: case 9: pairs.push([top(), bottom()]); break
          case 7: case 8: pairs.push([left(), top()]); break
          case 5: pairs.push([left(), top()], [bottom(), right()]); break
          case 10: pairs.push([top(), right()], [left(), bottom()]); break
        }
        const index = Math.abs(level) < step * 1e-6 || Math.abs(Math.round(level / step) % 5) === 0
        for (const [p, q] of pairs) {
          out.push({ x1: (p[0] + 0.5) / s, y1: (p[1] + 0.5) / s, x2: (q[0] + 0.5) / s, y2: (q[1] + 0.5) / s, index })
          if (out.length >= MAX_CONTOUR_SEGMENTS) return out
        }
      }
    }
  }
  return out
}

// ---- the cache: one set of heights per draft (rebuilt when the land or the biomes change) ----

interface Cached { key: string; biomes: BiomeIndex; grid: HeightGrid | null; contours?: ContourSegment[]; shade?: Map<string, unknown> }
const cache = new WeakMap<MapShape[], Cached>()

const keyOf = (d: Pick<MapDoc, 'width' | 'height' | 'base' | 'layers' | 'level' | 'units' | 'heightRange'>) =>
  `${d.width}x${d.height}|${d.base.biome}|${d.base.height}|${d.level}|${d.units}|${d.heightRange ?? ''}|${d.layers.filter(l => l.kind === 'terrain').map(l => l.id).join(',')}`

function cached(draft: Pick<MapDoc, 'width' | 'height' | 'base' | 'shapes' | 'layers' | 'level' | 'units' | 'heightRange'>, biomes: BiomeIndex): Cached {
  const key = keyOf(draft)
  const hit = cache.get(draft.shapes)
  if (hit && hit.key === key && hit.biomes === biomes) return hit
  const fresh: Cached = { key, biomes, grid: buildHeights(draft, biomes) }
  cache.set(draft.shapes, fresh)
  return fresh
}

export function heightsOf(draft: Pick<MapDoc, 'width' | 'height' | 'base' | 'shapes' | 'layers' | 'level' | 'units' | 'heightRange'>, biomes: BiomeIndex): HeightGrid | null {
  return cached(draft, biomes).grid
}

export function contoursOf(draft: Pick<MapDoc, 'width' | 'height' | 'base' | 'shapes' | 'layers' | 'level' | 'units' | 'heightRange'>, biomes: BiomeIndex): ContourSegment[] {
  const c = cached(draft, biomes)
  if (!c.grid) return []
  if (!c.contours) c.contours = contourLines(c.grid, contourStep(mapHeightRange(draft)))
  return c.contours
}

// Something made once from the heights of a draft and kept with them (the shading image the canvas draws), by a key of its own.
export function keptWithHeights<T>(draft: Pick<MapDoc, 'width' | 'height' | 'base' | 'shapes' | 'layers' | 'level' | 'units' | 'heightRange'>, biomes: BiomeIndex, key: string, make: (grid: HeightGrid) => T): T | null {
  const c = cached(draft, biomes)
  if (!c.grid) return null
  c.shade ??= new Map()
  if (!c.shade.has(key)) c.shade.set(key, make(c.grid))
  return c.shade.get(key) as T
}
