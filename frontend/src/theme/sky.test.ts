import { describe, expect, it } from 'vitest'
import {
  CLOUD_MAX_GAP, CLOUD_MAX_WIDTH, CLOUD_MIN_BOX, CLOUD_MIN_WIDTH, CONSTELLATIONS, ORB_BAND, ORB_NUDGE,
  cloudStrip, moonPath, moonPhase, nextZone, orbY, zodiacSign, type Sign,
} from './sky'
import { ZONE_KEYS } from './types'

describe('nextZone', () => {
  it('steps dawn > day > dusk > night > dawn', () => {
    expect(nextZone('dawn')).toBe('day')
    expect(nextZone('day')).toBe('dusk')
    expect(nextZone('dusk')).toBe('night')
    expect(nextZone('night')).toBe('dawn')
  })
})

describe('moonPhase', () => {
  it('is new at a known new moon and full at a known full moon', () => {
    const fromNew = moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14))).fraction
    expect(Math.min(fromNew, 1 - fromNew)).toBeLessThan(0.005)
    const full = moonPhase(new Date(Date.UTC(2000, 0, 21, 4, 40)))
    expect(Math.abs(full.fraction - 0.5)).toBeLessThan(0.03)
    expect(full.illumination).toBeGreaterThan(0.97)
  })

  it('stays between 0 and 1 for dates before the epoch, too', () => {
    const { fraction } = moonPhase(new Date(Date.UTC(1969, 6, 20)))
    expect(fraction).toBeGreaterThanOrEqual(0)
    expect(fraction).toBeLessThan(1)
  })
})

describe('moonPath', () => {
  const parse = (d: string) => {
    const m = d.match(/^M5 0A5 5 0 0 (\d) 5 10A([\d.]+) 5 0 0 (\d) 5 0Z$/)
    if (!m) throw new Error(`unexpected path ${d}`)
    return { outer: Number(m[1]), rx: Number(m[2]), inner: Number(m[3]) }
  }

  it('lights the right side while waxing and the left while waning', () => {
    expect(parse(moonPath(0.1, 10)).outer).toBe(1)
    expect(parse(moonPath(0.4, 10)).outer).toBe(1)
    expect(parse(moonPath(0.6, 10)).outer).toBe(0)
    expect(parse(moonPath(0.9, 10)).outer).toBe(0)
  })

  it('curves the terminator toward the lit side for a crescent and away for a gibbous', () => {
    expect(parse(moonPath(0.1, 10)).inner).toBe(0)
    expect(parse(moonPath(0.4, 10)).inner).toBe(1)
    expect(parse(moonPath(0.6, 10)).inner).toBe(0)
    expect(parse(moonPath(0.9, 10)).inner).toBe(1)
  })

  it('is a full disc at the full moon, and a straight terminator at a quarter', () => {
    expect(parse(moonPath(0.5, 10)).rx).toBe(5)
    expect(parse(moonPath(0.25, 10)).rx).toBe(0)
  })

  it('scales to the size asked for', () => {
    expect(moonPath(0.4, 6)).toMatch(/^M3 0A3 3 0 0 1 3 6A/)
  })
})

describe('zodiacSign', () => {
  const on = (m: number, d: number) => zodiacSign(new Date(2026, m - 1, d))
  it('changes on the Western dates', () => {
    expect(on(3, 20)).toBe('pisces')
    expect(on(3, 21)).toBe('aries')
    expect(on(4, 19)).toBe('aries')
    expect(on(4, 20)).toBe('taurus')
    expect(on(9, 22)).toBe('virgo')
    expect(on(9, 23)).toBe('libra')
    expect(on(12, 21)).toBe('sagittarius')
    expect(on(12, 22)).toBe('capricornus')
    expect(on(12, 31)).toBe('capricornus')
    expect(on(1, 1)).toBe('capricornus')
    expect(on(1, 19)).toBe('capricornus')
    expect(on(1, 20)).toBe('aquarius')
    expect(on(2, 19)).toBe('pisces')
  })
})

describe('CONSTELLATIONS', () => {
  const signs = Object.keys(CONSTELLATIONS) as Sign[]

  it('has all twelve signs', () => {
    expect(signs).toHaveLength(12)
  })

  it.each(signs)('%s: 5+ stars, valid lines, one bright star, starting beside the moon, near the sky', sign => {
    const { stars, lines } = CONSTELLATIONS[sign]
    expect(stars.length).toBeGreaterThanOrEqual(5)
    for (const [a, b] of lines) {
      expect(stars[a]).toBeDefined()
      expect(stars[b]).toBeDefined()
    }
    expect(stars.filter(s => s.bright)).toHaveLength(1)
    const xs = stars.map(s => s.x)
    const ys = stars.map(s => s.y)
    // Just right of the sun/moon button (30px), and at most a little past the edges.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(32)
    expect(Math.min(...xs)).toBeLessThanOrEqual(36)
    expect(Math.max(...xs)).toBeLessThanOrEqual(126)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(30)
  })
})

describe('cloudStrip', () => {
  const scales = [1, 0.75]

  it.each(scales)('widths and gaps stay in range at scale %s, wrap-around gap included', scale => {
    for (const seed of [7, 23, 99, 12345]) {
      const { clouds, length } = cloudStrip(seed, 14, scale)
      expect(clouds.length).toBeGreaterThan(2)
      expect(clouds[0].x).toBe(0)
      let end = 0
      clouds.forEach((c, i) => {
        expect(c.w).toBeGreaterThanOrEqual(Math.round(CLOUD_MIN_WIDTH * scale))
        expect(c.w).toBeLessThanOrEqual(Math.round(CLOUD_MAX_WIDTH * scale))
        if (i > 0) {
          const gap = c.x - end
          expect(gap).toBeGreaterThanOrEqual(0)
          expect(gap).toBeLessThanOrEqual(CLOUD_MAX_GAP)
        }
        end = c.x + c.w
      })
      const wrap = length - end
      expect(wrap).toBeGreaterThanOrEqual(0)
      expect(wrap).toBeLessThanOrEqual(CLOUD_MAX_GAP)
      expect(length).toBeGreaterThanOrEqual(240)
    }
  })

  it('stacks 2-4 rounded boxes on a flat base, each shorter and narrower than the one below, inside the strip', () => {
    for (const [height, seed] of [[14, 7], [9, 23], [14, 99], [9, 12345], [9, 1], [14, 2]]) {
      const { clouds } = cloudStrip(seed, height)
      for (const c of clouds) {
        expect(c.boxes.length).toBeGreaterThanOrEqual(2)
        expect(c.boxes.length).toBeLessThanOrEqual(4)
        expect(c.boxes[0].y + c.boxes[0].h).toBeCloseTo(height, 5) // the base is the strip's bottom
        expect(c.boxes[0].x).toBe(0)
        expect(c.boxes[0].w).toBe(c.w)
        c.boxes.forEach((b, i) => {
          expect(b.x).toBeGreaterThanOrEqual(0)
          expect(b.x + b.w).toBeLessThanOrEqual(c.w + 1e-6)
          expect(b.w).toBeGreaterThanOrEqual(CLOUD_MIN_BOX)
          expect(b.y).toBeGreaterThanOrEqual(0)
          if (i > 0) {
            const below = c.boxes[i - 1]
            expect(b.w).toBeLessThanOrEqual(below.w)
            if (!b.round) expect(b.h).toBeLessThanOrEqual(below.h + 1e-6)
            if (b.round) expect(b.w).toBe(b.h)
            expect(b.y).toBeLessThan(below.y)
            expect(b.x).toBeGreaterThanOrEqual(below.x)
            expect(b.x + b.w).toBeLessThanOrEqual(below.x + below.w + 1e-6)
          }
        })
      }
    }
  })

  it('has some circles among the boxes, never on the base', () => {
    const all = [7, 23, 99, 12345, 1, 2].flatMap(seed => cloudStrip(seed, 14).clouds.flatMap(c => c.boxes))
    expect(all.some(b => b.round)).toBe(true)
    expect(all.some(b => !b.round && b.y < 12)).toBe(true)
    expect(cloudStrip(7, 14).clouds.every(c => !c.boxes[0].round)).toBe(true)
  })

  it('is the same pattern for the same seed', () => {
    expect(cloudStrip(7, 14)).toEqual(cloudStrip(7, 14))
    expect(cloudStrip(7, 14)).not.toEqual(cloudStrip(8, 14))
  })
})

describe('orbY', () => {
  it('rests at the middle of the zone band when locked', () => {
    for (const zone of ZONE_KEYS) expect(orbY(zone, 12 * 60, false)).toEqual(ORB_BAND[zone])
  })

  it('moves within a couple of pixels of the band by the hour when following the clock', () => {
    for (const zone of ZONE_KEYS) {
      for (let minute = 0; minute < 1440; minute += 30) {
        const y = orbY(zone, minute, true)
        for (const kind of ['sun', 'moon'] as const) {
          const base = ORB_BAND[zone][kind]
          if (base === undefined) expect(y[kind]).toBeUndefined()
          else {
            expect(y[kind]!).toBeLessThanOrEqual(base)
            expect(y[kind]!).toBeGreaterThanOrEqual(base - ORB_NUDGE)
          }
        }
      }
    }
  })

  it('has the sun highest at noon and the moon highest at midnight', () => {
    expect(orbY('day', 12 * 60, true).sun).toBe(ORB_BAND.day.sun! - ORB_NUDGE)
    expect(orbY('night', 0, true).moon).toBe(ORB_BAND.night.moon! - ORB_NUDGE)
    expect(orbY('day', 6 * 60, true).sun).toBe(ORB_BAND.day.sun)
  })

  it('keeps day high, dawn low, dusk low with the moon above its sun, and dawn moon below', () => {
    expect(ORB_BAND.day.sun!).toBeLessThan(ORB_BAND.dawn.sun!)
    expect(ORB_BAND.day.sun!).toBeLessThan(ORB_BAND.dusk.sun!)
    expect(ORB_BAND.dusk.moon!).toBeLessThan(ORB_BAND.dusk.sun!)
    expect(ORB_BAND.dawn.moon!).toBeGreaterThan(ORB_BAND.dawn.sun!)
  })
})
