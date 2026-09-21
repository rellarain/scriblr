import { describe, expect, it } from 'vitest'
import { MIN_TEXT_GAP, ZONE_LOOKS } from '../../../theme/zoneLooks'
import { ZONE_KEYS } from '../../../theme/types'
import { AWARENESS_ORDER, AWARENESS_SHIFT, awarenessNext, awarenessShade, awarenessStyle, awarenessTitle } from './awareness'

describe('awareness', () => {
  it('starts front-stage and cycles through the four states', () => {
    expect(awarenessNext(null)).toBe('back')
    expect(AWARENESS_ORDER.map((_, i) => awarenessNext(AWARENESS_ORDER[i]))).toEqual(['back', 'mid', 'off', 'front'])
  })

  it('names each state and who knows', () => {
    expect(awarenessTitle('back')).toMatch(/^Back-stage: known to the audience, unknown to the characters/)
    expect(awarenessTitle('off')).toMatch(/unknown to the audience and the characters/)
  })

  it('shades the book hue: saturated or desaturated, bright or dark', () => {
    for (const zone of ZONE_KEYS) {
      const s = Object.fromEntries(AWARENESS_ORDER.map(a => [a, awarenessShade(zone, 200, a).fill]))
      expect(s.front.s).toBe(s.back.s)
      expect(s.mid.s).toBe(s.off.s)
      expect(s.front.s).toBeGreaterThan(s.mid.s)
      expect(s.front.l).toBe(s.mid.l)
      expect(s.back.l).toBe(s.off.l)
      expect(s.front.l).toBeGreaterThan(s.back.l)
      expect(s.front.l - ZONE_LOOKS[zone].accentL).toBe(AWARENESS_SHIFT)
    }
  })

  it('keeps the text 30+ points from every shade, for any hue, and readable', () => {
    for (const zone of ZONE_KEYS) {
      for (const state of AWARENESS_ORDER) {
        for (let h = 0; h < 360; h += 10) {
          const { fill, ink, contrast } = awarenessShade(zone, h, state)
          expect(Math.abs(ink.l - fill.l)).toBeGreaterThanOrEqual(MIN_TEXT_GAP)
          expect(contrast).toBeGreaterThanOrEqual(4.2)
        }
      }
    }
  })

  it('hands the colours to CSS', () => {
    const style = awarenessStyle('day', 200, 'front')
    expect(style['--wr-point-bg']).toMatch(/^hsl\(200, 80%, 54%\)$/)
    expect(style['--wr-point-ink']).toMatch(/^hsl\(/)
  })
})
