import { describe, expect, it } from 'vitest'
import { defaultThemeSettings } from './defaults'
import {
  activeZone, clockZone, configuredZones, disableZone, enableZone, formatMinute, msUntilNextBoundary,
  moveZoneStart, normalizeTheme, previousZone, resetZoneStart, resolveZone,
} from './zones'
import type { ThemeSettings } from './types'

function withZones(starts: Partial<Record<'dawn' | 'day' | 'dusk' | 'night', number>>): ThemeSettings {
  const s = defaultThemeSettings()
  for (const [key, start] of Object.entries(starts)) {
    const k = key as 'dawn' | 'day' | 'dusk' | 'night'
    s.zones[k] = { ...s.zones[k], configured: true, startMinute: start }
  }
  return s
}

const at = (h: number, m = 0, sec = 0) => new Date(2026, 0, 15, h, m, sec)

describe('resolveZone', () => {
  it('returns the only configured zone at any time', () => {
    const s = defaultThemeSettings()
    for (const minute of [0, 419, 420, 1439]) expect(resolveZone(s.zones, minute)).toBe('day')
  })

  it('picks the latest start at or before the minute', () => {
    const s = withZones({ dawn: 330, day: 420, dusk: 1080, night: 1260 })
    expect(resolveZone(s.zones, 330)).toBe('dawn')
    expect(resolveZone(s.zones, 419)).toBe('dawn')
    expect(resolveZone(s.zones, 420)).toBe('day')
    expect(resolveZone(s.zones, 1079)).toBe('day')
    expect(resolveZone(s.zones, 1080)).toBe('dusk')
    expect(resolveZone(s.zones, 1260)).toBe('night')
  })

  it('wraps past midnight to the last zone of the day', () => {
    const s = withZones({ dawn: 330, day: 420, dusk: 1080, night: 1260 })
    expect(resolveZone(s.zones, 0)).toBe('night')
    expect(resolveZone(s.zones, 329)).toBe('night')
  })

  it('works with only day and night', () => {
    const s = withZones({ day: 360, night: 1200 })
    expect(configuredZones(s.zones)).toEqual(['day', 'night'])
    expect(resolveZone(s.zones, 361)).toBe('day')
    expect(resolveZone(s.zones, 1200)).toBe('night')
    expect(resolveZone(s.zones, 100)).toBe('night')
  })

  it('handles starts at the edges of the day', () => {
    const s = withZones({ night: 0, day: 1430 })
    expect(resolveZone(s.zones, 0)).toBe('night')
    expect(resolveZone(s.zones, 1429)).toBe('night')
    expect(resolveZone(s.zones, 1430)).toBe('day')
  })

  it('breaks ties by canonical order', () => {
    const s = withZones({ dawn: 400, day: 400 })
    expect(configuredZones(s.zones)).toEqual(['dawn', 'day'])
  })
})

describe('msUntilNextBoundary', () => {
  it('is null with a single configured zone', () => {
    expect(msUntilNextBoundary(defaultThemeSettings().zones, at(12))).toBeNull()
  })

  it('counts down to the next start', () => {
    const s = withZones({ day: 420, night: 1260 })
    expect(msUntilNextBoundary(s.zones, at(20, 0))).toBe(60 * 60_000)
    expect(msUntilNextBoundary(s.zones, at(6, 59, 30))).toBe(30_000)
  })

  it('wraps to tomorrow after the last start', () => {
    const s = withZones({ day: 420, night: 1260 })
    expect(msUntilNextBoundary(s.zones, at(23, 0))).toBe((60 + 7 * 60) * 60_000)
  })

  it('never returns zero at exactly a boundary', () => {
    const s = withZones({ day: 420, night: 1260 })
    expect(msUntilNextBoundary(s.zones, at(7, 0))).toBe((1260 - 420) * 60_000)
  })
})

describe('enable / disable / normalize', () => {
  it('enables a zone with a copy of the Day hues and a free start', () => {
    let s = defaultThemeSettings()
    s.zones.day.palette.accent.h = 60
    s = enableZone(s, 'night')
    expect(s.zones.night.configured).toBe(true)
    expect(s.zones.night.palette.accent.h).toBe(60)
    expect(s.zones.night.palette).not.toBe(s.zones.day.palette)
  })

  it('bumps a clashing start to the next free slot', () => {
    let s = defaultThemeSettings()
    s.zones.dusk.startMinute = s.zones.day.startMinute
    s = enableZone(s, 'dusk')
    expect(s.zones.dusk.startMinute).toBe(s.zones.day.startMinute + 10)
  })

  it('takes the colours of the zone before it in the day when it is turned on', () => {
    let s = defaultThemeSettings()
    s = { ...s, hues: [...s.hues, { id: 'h5', h: 100 }] }
    s.zones.day = { ...s.zones.day, palette: { ...s.zones.day.palette, accent: { h: 100 } }, links: { ...s.zones.day.links, accent: 'h5' } }
    const dusk = enableZone(s, 'dusk')
    expect(dusk.zones.dusk.palette).toEqual(s.zones.day.palette)
    expect(dusk.zones.dusk.palette).not.toBe(s.zones.day.palette) // a copy
    expect(dusk.zones.dusk.links).toEqual(s.zones.day.links)
    expect(dusk.zones.dusk.links).not.toBe(s.zones.day.links)
    // Night then follows Dusk, which is the nearest one before it that is on.
    const dusk2 = { ...dusk, zones: { ...dusk.zones, dusk: { ...dusk.zones.dusk, palette: { ...dusk.zones.dusk.palette, alert: { h: 5 } }, links: {} } } }
    expect(enableZone(dusk2, 'night').zones.night.palette.alert.h).toBe(5)
    // Dawn comes after Night in the order, so with Day and Dusk on it takes Night's slot: the nearest earlier one, wrapping round.
    expect(enableZone(dusk2, 'dawn').zones.dawn.palette).toEqual(dusk2.zones.dusk.palette)
  })

  it('finds the zone before it in the day that is on, round to the end', () => {
    const s = withZones({ dusk: 960 })
    expect(previousZone(s.zones, 'night')).toBe('dusk')
    expect(previousZone(s.zones, 'dawn')).toBe('dusk') // wraps past midnight
    expect(previousZone(s.zones, 'dusk')).toBe('day')
    expect(previousZone(defaultThemeSettings().zones, 'day')).toBeNull() // no other zone is on
  })

  it('turns Day off when another zone is on, but never the last zone', () => {
    const both = enableZone(defaultThemeSettings(), 'night')
    const off = disableZone(both, 'day')
    expect(off.zones.day.configured).toBe(false)
    expect(configuredZones(off.zones)).toEqual(['night'])
    expect(disableZone(off, 'night')).toBe(off) // the last one stays
    const lone = defaultThemeSettings()
    expect(disableZone(lone, 'day')).toBe(lone)
    expect(disableZone(lone, 'dusk')).toBe(lone) // already off
  })

  it('clears a zone\'s colours and links, and a stale override, when it is turned off', () => {
    let s = enableZone(defaultThemeSettings(), 'night')
    s = { ...s, override: 'night' }
    s.zones.night = { ...s.zones.night, palette: { ...s.zones.night.palette, accent: { h: 99 } }, links: {} }
    const next = disableZone(s, 'night')
    expect(next.override).toBeNull()
    expect(next.zones.night.links).toEqual({})
    expect(next.zones.night.palette.accent.h).not.toBe(99)
    expect(next.zones.night.startMinute).toBe(s.zones.night.startMinute) // the time stays
    expect(disableZone(s, 'day').override).toBe('night') // an override on another zone stays
  })

  it('normalizes bad input', () => {
    const s = normalizeTheme({
      override: 'dusk',
      zones: { day: { configured: false, startMinute: 423, palette: defaultThemeSettings().zones.day.palette } },
    } as unknown as ThemeSettings)
    expect(s.zones.day.configured).toBe(true) // at least one zone stays on
    expect(s.zones.day.startMinute).toBe(420)
    expect(s.override).toBeNull() // Dusk is off, so it cannot be locked
    expect(normalizeTheme({ override: 'noon' } as unknown as ThemeSettings).override).toBeNull()
    expect(normalizeTheme(null)).toEqual(defaultThemeSettings())
  })

  it('allows Day to be off while another zone is on', () => {
    const s = normalizeTheme({
      zones: { day: { configured: false, startMinute: 420 }, night: { configured: true, startMinute: 1260 } },
    } as unknown as ThemeSettings)
    expect(configuredZones(s.zones)).toEqual(['night'])
  })

  it('works out whether the clock is followed from the zones that are on', () => {
    expect(normalizeTheme({ timeBasedEnabled: true } as unknown as ThemeSettings).timeBasedEnabled).toBe(false) // one zone
    const two = normalizeTheme({ timeBasedEnabled: false, zones: { night: { configured: true, startMinute: 1260 } } } as unknown as ThemeSettings)
    expect(two.timeBasedEnabled).toBe(true)
  })

  it('keeps a lock only on a zone that is on', () => {
    const base = { zones: { night: { configured: true, startMinute: 1260 } } }
    expect(normalizeTheme({ ...base, override: 'night' } as unknown as ThemeSettings).override).toBe('night')
    expect(normalizeTheme({ ...base, override: 'dawn' } as unknown as ThemeSettings).override).toBeNull()
  })

  it('starts an account with no hue list from the hues its zones use, each role linked to its swatch', () => {
    const day = { theme: { h: 10 }, accent: { h: 20 }, alert: { h: 10 }, accent2: { h: 40 } }
    const night = { theme: { h: 20 }, accent: { h: 50 }, alert: { h: 40 }, accent2: { h: 60 } }
    const s = normalizeTheme({
      zones: { day: { configured: true, startMinute: 420, palette: day }, night: { configured: true, startMinute: 1260, palette: night } },
    } as unknown as ThemeSettings)
    expect(s.hues).toEqual([{ id: 'h1', h: 10 }, { id: 'h2', h: 20 }, { id: 'h3', h: 40 }, { id: 'h4', h: 50 }, { id: 'h5', h: 60 }])
    expect(s.zones.day.links).toEqual({ theme: 'h1', accent: 'h2', alert: 'h1', accent2: 'h3' })
    expect(s.zones.night.links).toEqual({ theme: 'h2', accent: 'h4', alert: 'h3', accent2: 'h5' })
    // Seeding is stable: what was seeded is kept as it is.
    expect(normalizeTheme(s)).toEqual(s)
  })

  it('keeps a role whose hue did not fit in the ten as it was, unlinked', () => {
    const palette = (a: number) => ({ theme: { h: a }, accent: { h: a + 1 }, alert: { h: a + 2 }, accent2: { h: a + 3 } })
    const s = normalizeTheme({
      zones: {
        dawn: { configured: true, startMinute: 240, palette: palette(0) },
        day: { configured: true, startMinute: 600, palette: palette(10) },
        dusk: { configured: true, startMinute: 960, palette: palette(20) },
      },
    } as unknown as ThemeSettings)
    expect(s.hues).toHaveLength(10)
    expect(s.zones.dusk.links.accent2).toBeUndefined()
    expect(s.zones.dusk.palette.accent2.h).toBe(23)
  })

  it('repairs the links: a link to a swatch that is gone is dropped, a linked role takes its swatch\'s hue', () => {
    const given = {
      hues: [{ id: 'a', h: 77 }, { id: 'b', h: 5 }, { id: 'a', h: 1 }, { id: 'bad id', h: 3 }, { id: 'c', h: 999 }],
      zones: {
        day: {
          configured: true, startMinute: 420,
          palette: { theme: { h: 1 }, accent: { h: 2 }, alert: { h: 3 }, accent2: { h: 4 } },
          links: { theme: 'a', accent: 'gone', alert: 'b', accent2: 7 },
        },
      },
    }
    const s = normalizeTheme(given as unknown as ThemeSettings)
    expect(s.hues).toEqual([{ id: 'a', h: 77 }, { id: 'b', h: 5 }, { id: 'c', h: 360 }])
    expect(s.zones.day.links).toEqual({ theme: 'a', alert: 'b' })
    expect(s.zones.day.palette).toEqual({ theme: { h: 77 }, accent: { h: 2 }, alert: { h: 5 }, accent2: { h: 4 } })
  })

  it('gives a zone that is off no links', () => {
    const given = {
      zones: { day: { configured: true, startMinute: 420 }, dusk: { configured: false, startMinute: 1080, links: { theme: 'h1' } } },
    }
    expect(normalizeTheme(given as unknown as ThemeSettings).zones.dusk.links).toEqual({})
  })

  it('keeps just the hues of a palette saved by an older version', () => {
    const old = { theme: { h: 10, s: 30 }, accent: { h: 20, s: 95 }, alert: { h: 30, s: 100 }, accent2: { h: 40, s: 60 }, brightness: 35 }
    const s = normalizeTheme({ zones: { night: { configured: true, startMinute: 1260, palette: old } } } as unknown as ThemeSettings)
    expect(s.zones.night.palette).toEqual({ theme: { h: 10 }, accent: { h: 20 }, alert: { h: 30 }, accent2: { h: 40 } })
  })

  it('clamps start times', () => {
    const s = normalizeTheme({ zones: { night: { configured: true, startMinute: 9999 } } } as unknown as ThemeSettings)
    expect(s.zones.night.startMinute).toBe(1430)
  })
})

describe('activeZone', () => {
  it('follows the schedule with two zones or more, and an override wins', () => {
    const s = withZones({ day: 420, night: 1260 })
    expect(clockZone(s, at(23))).toBe('night')
    expect(clockZone(s, at(9))).toBe('day')
    expect(activeZone(s, at(23))).toBe('night')
    expect(activeZone({ ...s, override: 'day' }, at(23))).toBe('day')
  })

  it('is the one zone that is on, whatever the time, even when it is not Day', () => {
    const s = disableZone(enableZone(defaultThemeSettings(), 'night'), 'day')
    expect(clockZone(s, at(9))).toBe('night')
    expect(clockZone(s, at(23))).toBe('night')
    expect(clockZone(defaultThemeSettings(), at(3))).toBe('day')
  })
})

describe('formatMinute', () => {
  it('formats 12-hour clock times', () => {
    expect(formatMinute(0)).toBe('12:00 AM')
    expect(formatMinute(65)).toBe('1:05 AM')
    expect(formatMinute(420)).toBe('7:00 AM')
    expect(formatMinute(720)).toBe('12:00 PM')
    expect(formatMinute(1080)).toBe('6:00 PM')
    expect(formatMinute(1430)).toBe('11:50 PM')
    expect(formatMinute(1440)).toBe('12:00 AM')
  })
})

describe('moveZoneStart', () => {
  const starts = (s: ThemeSettings) => Object.fromEntries(configuredZones(s.zones).map(k => [k, s.zones[k].startMinute]))

  it('moves a zone to the time, keeping the others where they are', () => {
    const s = withZones({ day: 420, dusk: 1080, night: 1320 })
    expect(starts(moveZoneStart(s, 'dusk', 1020))).toEqual({ day: 420, dusk: 1020, night: 1320 })
  })

  it('pushes the next zones along when it runs into them, an hour apart', () => {
    const s = withZones({ day: 420, dusk: 1080, night: 1140 })
    expect(starts(moveZoneStart(s, 'day', 1100))).toEqual({ day: 1100, dusk: 1160, night: 1220 })
  })

  it('pushes the earlier zones back when moving left into them', () => {
    const s = withZones({ dawn: 240, day: 600, dusk: 660 })
    expect(starts(moveZoneStart(s, 'dusk', 200))).toEqual({ dawn: 80, day: 140, dusk: 200 })
  })

  it('never carries a zone past the ends of the day: each keeps an hour', () => {
    const s = withZones({ day: 420, dusk: 1080, night: 1320 })
    expect(starts(moveZoneStart(s, 'day', 1439))).toEqual({ day: 1260, dusk: 1320, night: 1380 })
    expect(starts(moveZoneStart(s, 'night', -50))).toEqual({ day: 0, dusk: 60, night: 120 })
  })

  it('moves a lone zone freely, and does nothing for a zone that is off or when nothing changes', () => {
    const one = defaultThemeSettings()
    expect(starts(moveZoneStart(one, 'day', 900))).toEqual({ day: 900 })
    expect(starts(moveZoneStart(one, 'day', 5000))).toEqual({ day: 1380 })
    const two = withZones({ day: 420, dusk: 1080 })
    expect(moveZoneStart(two, 'night', 900)).toBe(two)
    expect(moveZoneStart(two, 'dusk', 1080)).toBe(two)
  })

  it('puts a zone back to its default time (dawn 4, day 10, dusk 4 PM, night 10 PM), pushing a neighbour if it is in the way', () => {
    const s = withZones({ dawn: 100, day: 200, dusk: 300, night: 400 })
    expect(starts(resetZoneStart(s, 'night'))).toEqual({ dawn: 100, day: 200, dusk: 300, night: 1320 })
    const crowded = withZones({ day: 600, dusk: 900, night: 960 })
    expect(starts(resetZoneStart(crowded, 'dusk'))).toEqual({ day: 600, dusk: 960, night: 1020 })
  })
})
