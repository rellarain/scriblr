import { describe, expect, it } from 'vitest'
import { TEXT_TARGET } from '../../../theme/readable'
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
      expect(s.front.l).toBeGreaterThanOrEqual(s.back.l)
      expect(s.mid.l).toBeGreaterThanOrEqual(s.off.l)
    }
  })

  it('reads the text on every shade, for any hue, in every zone (4.5:1)', () => {
    for (const zone of ZONE_KEYS) {
      for (const state of AWARENESS_ORDER) {
        for (let h = 0; h < 360; h += 10) {
          const { contrast } = awarenessShade(zone, h, state)
          expect(contrast).toBeGreaterThanOrEqual(TEXT_TARGET)
        }
      }
    }
  })

  it('hands the colours to CSS', () => {
    const style = awarenessStyle('day', 200, 'front')
    expect(style['--wr-point-bg']).toMatch(/^hsl\(200, 80%, [\d.]+%\)$/)
    expect(style['--wr-point-ink']).toMatch(/^hsl\(/)
  })
})
