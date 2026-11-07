import { describe, expect, it } from 'vitest'
import type { CharacterPortrait } from '../../../../../api/types'
import { defaultPortrait, normalizePortrait } from './defaults'
import { crownVol, hairModel, hangW } from './draw/hair'
import { LENGTHS } from './library'
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
