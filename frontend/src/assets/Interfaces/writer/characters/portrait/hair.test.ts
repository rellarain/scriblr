import { describe, expect, it } from 'vitest'
import type { CharacterPortrait } from '../../../../../api/types'
import { defaultPortrait, normalizePortrait } from './defaults'
import { crownVol, curtainPlan, endBend, hairModel, hangW, sideThickness, tucked } from './draw/hair'
import { ENDS, LENGTHS, PLACEMENTS } from './library'
import { rnd, uneven } from './paths'
import { rigOf } from './rig'
import { drawnOf, portraitShapes } from './scene'

const portrait = (over: Partial<CharacterPortrait> = {}): CharacterPortrait => normalizePortrait({ ...defaultPortrait(), hairColor: '#7a3f22', ...over })
const model = (over: Partial<CharacterPortrait>) => { const d = drawnOf(portrait(over)); return hairModel(rigOf(d), d) }

// The highest point of the hair: the smallest y of any path painted in the hair colour (the top of the cap).
function crownTop(over: Partial<CharacterPortrait>): number {
  const p = portrait(over)
  let top = Infinity
  for (const s of portraitShapes(p)) {
    if (s.fill !== p.hairColor) continue
    const nums = (s.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    for (let i = 1; i < nums.length; i += 2) top = Math.min(top, nums[i])
  }
  return top
}

describe('the thickness of hair that hangs', () => {
  const hanging = LENGTHS.filter(l => l.i >= 3).map(l => l.id)

  it('grows with the length, so a longer fall of hair has a fuller crown', () => {
    const widths = hanging.map(id => hangW(model({ hairLength: id, hairTexture: '1A' })))
    const crowns = hanging.map(id => crownVol(model({ hairLength: id, hairTexture: '1A' })))
    for (let i = 1; i < hanging.length; i++) {
      expect(widths[i], hanging[i]).toBeGreaterThanOrEqual(widths[i - 1])
      expect(crowns[i], hanging[i]).toBeGreaterThanOrEqual(crowns[i - 1])
    }
    expect(widths[widths.length - 1]).toBeGreaterThan(widths[0] + 4)
  })

  it('has a crown that is nearly as thick as the sides, never thicker', () => {
    for (const id of hanging) for (const texture of ['1A', '2B', '3B']) {
      const m = model({ hairLength: id, hairTexture: texture })
      expect(crownVol(m) / hangW(m), `${id} ${texture}`).toBeGreaterThan(0.6)
      expect(crownVol(m) / hangW(m), `${id} ${texture}`).toBeLessThanOrEqual(1)
    }
  })

  it('is never thinner than a plain cap over the skull, whatever the texture', () => {
    for (const texture of ['1A', '1B', '1C', '2A', '2B', '2C', '3A', '3B', '3C']) {
      const m = model({ hairLength: 'chest', hairTexture: texture })
      expect(hangW(m), texture).toBeGreaterThanOrEqual(m.V * 0.9)
      expect(crownVol(m), texture).toBeGreaterThan(m.V * 0.5)
    }
  })

  it('draws the top of long straight hair higher than the top of a bob, as fine hair as the other', () => {
    const bob = crownTop({ hairLength: 'chin', hairTexture: '1A' })
    const chest = crownTop({ hairLength: 'chest', hairTexture: '1A' })
    const hip = crownTop({ hairLength: 'hip', hairTexture: '1A' })
    const rapunzel = crownTop({ hairLength: 'rapunzel', hairTexture: '1A' })
    expect(chest).toBeLessThan(bob)
    expect(hip).toBeLessThan(chest)
    expect(rapunzel).toBeLessThan(hip)
    // The crown of long hair stands off the skull as the hair is thick: well clear of a buzz cut's.
    const buzz = crownTop({ hairLength: 'buzzed' })
    expect(buzz - chest).toBeGreaterThan(4)
  })

  it('leaves hair that does not hang as it was: a short cut keeps its tight cap', () => {
    const m = model({ hairLength: 'short', hairTexture: '1A' })
    expect(m.hang).toBe(false)
    const short = crownTop({ hairLength: 'short', hairTexture: '1A' })
    const chest = crownTop({ hairLength: 'chest', hairTexture: '1A' })
    expect(chest).toBeLessThan(short)
  })
})

describe('where the hair lies', () => {
  const loose = { hairLength: 'chest', hairTexture: '1A', hairFront: 'centre' }
  const placed = (place: string) => model({ ...loose, hairPlacement: place })

  it('has both sides in front for the usual placement, and each side at the eye line', () => {
    const m = placed('front')
    expect(m.hang).toBe(true)
    expect(curtainPlan(m)).toEqual([{}])
    expect(m.sideYR).toBe(m.sideY)
    expect(m.sideYL).toBe(m.sideY)
    expect(tucked(m, 1)).toBe(false)
    expect(tucked(m, -1)).toBe(false)
  })

  it('puts the hair on one side of the picture, in front, with the other side tucked behind the ear', () => {
    const left = placed('left'), right = placed('right')
    expect(curtainPlan(left)).toEqual([{ only: -1 }])
    expect(curtainPlan(right)).toEqual([{ only: 1 }])
    // The left of the picture is the left (-1): its hair is in front, the right is tucked, and the other way round.
    expect(tucked(left, 1)).toBe(true)
    expect(tucked(left, -1)).toBe(false)
    expect(tucked(right, -1)).toBe(true)
    expect(tucked(right, 1)).toBe(false)
    expect(left.sideYL).toBe(left.sideY)
    expect(left.sideYR).toBeLessThan(left.sideYL)
    expect(sideThickness(left, 1)).toBeLessThan(sideThickness(left, -1))
  })

  it('brings all the hair over one shoulder, wide, and tucks the other side', () => {
    expect(curtainPlan(placed('allleft'))).toEqual([{ only: -1, wide: true }])
    expect(curtainPlan(placed('allright'))).toEqual([{ only: 1, wide: true }])
    expect(tucked(placed('allleft'), 1)).toBe(true)
    expect(tucked(placed('allright'), -1)).toBe(true)
  })

  it('has no fall in front at all when all the hair is behind, and both sides tucked', () => {
    const m = placed('behind')
    expect(curtainPlan(m)).toEqual([])
    expect(tucked(m, 1) && tucked(m, -1)).toBe(true)
  })

  it('leaves hair that does not hang alone: a cut stays in front whatever the placement says', () => {
    const m = model({ hairLength: 'short', hairPlacement: 'allleft', hairEnds: 'in' })
    expect(m.hang).toBe(false)
    expect(m.place).toBe('front')
    expect(m.ends).toBe('straight')
    expect(tucked(m, 1)).toBe(false)
  })

  it('draws each placement as a different picture, and each one whole', () => {
    const seen = new Set<string>()
    for (const o of PLACEMENTS) {
      const shapes = portraitShapes(portrait({ ...loose, hairPlacement: o.id }))
      seen.add(JSON.stringify(shapes))
      expect(JSON.stringify(shapes), o.id).not.toMatch(/NaN|undefined/)
    }
    expect(seen.size).toBe(PLACEMENTS.length)
  })

  it('covers the ears wherever the hair is in front, however far they stick out', () => {
    for (const ears of ['small', 'protruding', 'wide', 'large']) {
      const m = model({ ...loose, ears })
      expect(hangW(m), ears).toBeGreaterThanOrEqual(m.ear)
    }
  })
})

describe('the ends of the hair', () => {
  const base = { hairLength: 'chest', hairTexture: '1A', hairFront: 'centre' }

  it('turn in toward the neck, or out, over the last of the length, and not at all when cut straight', () => {
    const straight = model({ ...base, hairEnds: 'straight' }), inward = model({ ...base, hairEnds: 'in' }), outward = model({ ...base, hairEnds: 'out' })
    for (const t of [0, 0.3, 0.6, 0.68]) {
      expect(endBend(straight, t)).toBe(0)
      expect(endBend(inward, t)).toBe(0)
      expect(endBend(outward, t)).toBe(0)
    }
    expect(endBend(straight, 1)).toBe(0)
    expect(endBend(inward, 1)).toBeLessThan(-4)
    expect(endBend(outward, 1)).toBeGreaterThan(4)
    expect(endBend(outward, 1)).toBe(-endBend(inward, 1))
    expect(Math.abs(endBend(outward, 0.9))).toBeLessThan(Math.abs(endBend(outward, 1)))
  })

  it('make a different picture each, and each one whole', () => {
    const seen = new Set<string>()
    for (const o of ENDS) {
      const shapes = portraitShapes(portrait({ ...base, hairEnds: o.id }))
      seen.add(JSON.stringify(shapes))
      expect(JSON.stringify(shapes), o.id).not.toMatch(/NaN|undefined/)
    }
    expect(seen.size).toBe(ENDS.length)
  })
})

describe('curls and coils are not all alike', () => {
  it('gives a repeatable number for each whole number, spread over 0 to 1', () => {
    expect(rnd(5)).toBe(rnd(5))
    const values = Array.from({ length: 200 }, (_, i) => rnd(i))
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...values)).toBeLessThan(1)
    expect(new Set(values).size).toBeGreaterThan(190)
    expect(values.filter(v => v < 0.5).length).toBeGreaterThan(70)
    expect(values.filter(v => v < 0.5).length).toBeLessThan(130)
  })

  it('puts points along an outline at spaces that vary, the same every time', () => {
    const circle = Array.from({ length: 60 }, (_, i) => [100 + 40 * Math.cos(i / 60 * 2 * Math.PI), 100 + 40 * Math.sin(i / 60 * 2 * Math.PI)])
    const a = uneven(circle, 8, 0.4), b = uneven(circle, 8, 0.4)
    expect(a).toEqual(b)
    const gaps = a.map((q, i) => Math.hypot(a[(i + 1) % a.length][0] - q[0], a[(i + 1) % a.length][1] - q[1])).slice(0, -1)
    const mean = gaps.reduce((x, y) => x + y, 0) / gaps.length
    const spread = Math.sqrt(gaps.reduce((x, y) => x + (y - mean) ** 2, 0) / gaps.length) / mean
    expect(spread).toBeGreaterThan(0.12)
    expect(Math.max(...gaps)).toBeGreaterThan(Math.min(...gaps) * 1.4)
  })

  it('draws a curly or coily edge that is not the same on both sides', () => {
    // The hair on the right of the picture, turned over to the left, is not the hair on the left: count the points that have a partner.
    const matched = (texture: string) => {
      const p = portrait({ hairLength: 'chest', hairTexture: texture, hairFront: 'centre' })
      const shapes = portraitShapes(p).filter(s => s.fill === p.hairColor)
      const biggest = shapes.reduce((a, b) => (b.d.length > a.d.length ? b : a))
      const nums = (biggest.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
      const pts: Array<[number, number]> = []
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]])
      const near = (x: number, y: number) => pts.some(q => Math.abs(q[0] - x) < 0.8 && Math.abs(q[1] - y) < 0.8)
      return pts.filter(q => near(200 - q[0], q[1])).length / pts.length
    }
    for (const texture of ['3A', '3B', '3C', '4A', '4B', '4C']) expect(matched(texture), texture).toBeLessThan(0.5)
  })

  it('draws curly hair the same way every time', () => {
    const p = portrait({ hairLength: 'hip', hairTexture: '3C' })
    expect(portraitShapes(p)).toEqual(portraitShapes({ ...p }))
  })
})
