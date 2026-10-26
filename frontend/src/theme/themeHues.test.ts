import { describe, expect, it } from 'vitest'
import { defaultThemeSettings } from './defaults'
import {
  addHue, assignHue, autoLinks, copyRole, hueUses, moveHue, nextHueId, normalizeHues, normalizeLinks, removeHue, seedHues, setHue, swapRoles, syncPalette,
} from './themeHues'
import { MAX_HUE_SWATCHES, type ThemeSettings } from './types'
import { enableZone } from './zones'

// The default account: Day on, with the four default swatches h1..h4 (theme 330, accent 32, alert 200, admin accent 260).
const base = () => defaultThemeSettings()
const two = () => enableZone(base(), 'night') // Night takes Day's hues and links

const full = (): ThemeSettings => {
  let s = base()
  for (let h = 100; s.hues.length < MAX_HUE_SWATCHES; h += 10) s = addHue(s, h)
  return s
}

describe('the swatch ids', () => {
  it('takes the first h-number not used', () => {
    expect(nextHueId([])).toBe('h1')
    expect(nextHueId([{ id: 'h1', h: 0 }, { id: 'h3', h: 0 }])).toBe('h2')
    expect(nextHueId([{ id: 'h1', h: 0 }, { id: 'h2', h: 0 }])).toBe('h3')
  })
})

describe('normalizeHues', () => {
  it('keeps well-formed swatches, whole hues within 0..360, distinct ids, the first ten', () => {
    const given = [
      { id: 'a', h: 12.6 }, { id: 'a', h: 5 }, { id: 'b', h: -4 }, { id: 'c', h: 999 }, { id: 'bad id', h: 1 },
      { id: '', h: 1 }, { id: 'd' }, { id: 7, h: 1 }, null, 'x', { id: 'e', h: Number.NaN },
    ]
    expect(normalizeHues(given)).toEqual([{ id: 'a', h: 13 }, { id: 'b', h: 0 }, { id: 'c', h: 360 }, { id: 'e', h: 0 }])
  })

  it('stops at ten, and an input that is not a list gives none', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, h: i }))
    expect(normalizeHues(many)).toHaveLength(10)
    expect(normalizeHues(undefined)).toEqual([])
    expect(normalizeHues({ id: 'a', h: 1 })).toEqual([])
  })
})

describe('seedHues', () => {
  it('lists the distinct hues of the zones that are on, theme first, a zone at a time', () => {
    const s = two()
    s.zones.night = { ...s.zones.night, palette: { ...s.zones.night.palette, theme: { h: 90 }, alert: { h: 32 } } }
    expect(seedHues(s.zones).map(w => w.h)).toEqual([330, 32, 200, 260, 90])
    expect(seedHues(s.zones).map(w => w.id)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5'])
  })

  it('leaves out a zone that is off', () => {
    const s = base()
    s.zones.dusk = { ...s.zones.dusk, palette: { ...s.zones.dusk.palette, theme: { h: 1 } } }
    expect(seedHues(s.zones).map(w => w.h)).toEqual([330, 32, 200, 260])
  })
})

describe('links', () => {
  it('autoLinks links each role to the first swatch of its hue', () => {
    const hues = [{ id: 'x', h: 32 }, { id: 'y', h: 32 }, { id: 'z', h: 330 }]
    expect(autoLinks(base().zones.day.palette, hues)).toEqual({ theme: 'z', accent: 'x' })
  })

  it('normalizeLinks keeps only the four roles and swatches that exist', () => {
    const hues = [{ id: 'a', h: 1 }]
    expect(normalizeLinks({ theme: 'a', accent: 'gone', alert: 3, other: 'a' }, hues)).toEqual({ theme: 'a' })
    expect(normalizeLinks(null, hues)).toEqual({})
  })

  it('syncPalette sets each linked role to its swatch\'s hue and leaves the rest', () => {
    const hues = [{ id: 'a', h: 77 }]
    const next = syncPalette(base().zones.day.palette, { theme: 'a' }, hues)
    expect(next.theme.h).toBe(77)
    expect(next.accent.h).toBe(32)
  })
})

describe('hueUses', () => {
  it('names every role that uses a swatch, in the zones that are on', () => {
    const s = two()
    expect(hueUses(s, 'h1')).toEqual([{ zone: 'day', role: 'theme' }, { zone: 'night', role: 'theme' }])
    expect(hueUses(s, 'nothing')).toEqual([])
  })

  it('does not count a zone that is off', () => {
    const s = two()
    s.zones.dusk = { ...s.zones.dusk, links: { theme: 'h1' } } // left over; the zone is off
    expect(hueUses(s, 'h1')).toHaveLength(2)
  })
})

describe('addHue', () => {
  it('adds a swatch at the end with the next id', () => {
    const s = addHue(base(), 123)
    expect(s.hues.at(-1)).toEqual({ id: 'h5', h: 123 })
    expect(base().hues).toHaveLength(4) // the input is untouched
  })

  it('does not add an eleventh, and clamps the hue', () => {
    const s = full()
    expect(s.hues).toHaveLength(10)
    expect(addHue(s, 5)).toBe(s)
    expect(addHue(base(), 999).hues.at(-1)?.h).toBe(360)
  })
})

describe('setHue', () => {
  it('changes a swatch and every role that uses it, in every zone', () => {
    const s = setHue(two(), 'h2', 90)
    expect(s.hues.find(w => w.id === 'h2')?.h).toBe(90)
    expect(s.zones.day.palette.accent.h).toBe(90)
    expect(s.zones.night.palette.accent.h).toBe(90)
    expect(s.zones.day.palette.theme.h).toBe(330) // others stay
  })

  it('does nothing for an unknown swatch or the same hue', () => {
    const s = base()
    expect(setHue(s, 'nope', 5)).toBe(s)
    expect(setHue(s, 'h1', 330)).toBe(s)
  })
})

describe('removeHue', () => {
  it('removes a swatch no role uses', () => {
    const s = addHue(base(), 50)
    expect(removeHue(s, 'h5')?.hues.map(w => w.id)).toEqual(['h1', 'h2', 'h3', 'h4'])
  })

  it('refuses one that is in use, one that is unknown, and the last one', () => {
    expect(removeHue(base(), 'h1')).toBeNull()
    expect(removeHue(base(), 'zzz')).toBeNull()
    let s = base()
    s = { ...s, hues: [s.hues[0]] }
    expect(removeHue({ ...s, zones: { ...s.zones, day: { ...s.zones.day, links: {} } } }, 'h1')).toBeNull()
  })
})

describe('moveHue', () => {
  const ids = (s: ThemeSettings) => s.hues.map(w => w.id)

  it('moves a swatch before another, or to the end', () => {
    expect(ids(moveHue(base(), 'h4', 'h2'))).toEqual(['h1', 'h4', 'h2', 'h3'])
    expect(ids(moveHue(base(), 'h1', null))).toEqual(['h2', 'h3', 'h4', 'h1'])
    expect(ids(moveHue(base(), 'h3', 'h1'))).toEqual(['h3', 'h1', 'h2', 'h4'])
  })

  it('returns the same settings when nothing changes', () => {
    const s = base()
    expect(moveHue(s, 'h2', 'h2')).toBe(s)
    expect(moveHue(s, 'h2', 'h3')).toBe(s) // already just before h3
    expect(moveHue(s, 'h4', null)).toBe(s)
    expect(moveHue(s, 'unknown', 'h1')).toBe(s)
    expect(moveHue(s, 'h1', 'unknown')).toBe(s)
  })
})

describe('assignHue', () => {
  it('links a role of a zone that is on to a swatch, and sets its hue', () => {
    const s = assignHue(two(), 'night', 'alert', 'h1')
    expect(s.zones.night.links.alert).toBe('h1')
    expect(s.zones.night.palette.alert.h).toBe(330)
    expect(s.zones.day.links.alert).toBe('h3') // other zones are not touched
  })

  it('does nothing for a zone that is off, an unknown swatch, or what is already so', () => {
    const s = two()
    expect(assignHue(s, 'dusk', 'theme', 'h1')).toBe(s)
    expect(assignHue(s, 'day', 'theme', 'nope')).toBe(s)
    expect(assignHue(s, 'day', 'theme', 'h1')).toBe(s)
  })

  it('relinks a role that was linked to another swatch, and repairs one whose hue drifted', () => {
    const drifted = base()
    drifted.zones.day = { ...drifted.zones.day, palette: { ...drifted.zones.day.palette, theme: { h: 1 } } }
    expect(assignHue(drifted, 'day', 'theme', 'h1').zones.day.palette.theme.h).toBe(330)
  })
})

describe('swapRoles', () => {
  it('trades two roles of a zone, hues and links together', () => {
    const s = swapRoles(two(), 'day', 'theme', 'accent')
    expect(s.zones.day.palette.theme.h).toBe(32)
    expect(s.zones.day.palette.accent.h).toBe(330)
    expect(s.zones.day.links).toMatchObject({ theme: 'h2', accent: 'h1' })
    expect(s.zones.night.links).toMatchObject({ theme: 'h1', accent: 'h2' }) // another zone is not touched
  })

  it('trades a linked role with one that is not', () => {
    const s = base()
    s.zones.day = { ...s.zones.day, links: { theme: 'h1' } }
    const next = swapRoles(s, 'day', 'theme', 'accent')
    expect(next.zones.day.links.accent).toBe('h1')
    expect(next.zones.day.links.theme).toBeUndefined()
    expect('theme' in next.zones.day.links).toBe(false)
  })

  it('does nothing for the same role or a zone that is off', () => {
    const s = two()
    expect(swapRoles(s, 'day', 'theme', 'theme')).toBe(s)
    expect(swapRoles(s, 'dusk', 'theme', 'accent')).toBe(s)
  })
})

describe('copyRole', () => {
  it('gives a role another zone\'s hue and link, and leaves the source as it is', () => {
    const s = two()
    const night = assignHue(s, 'night', 'accent', 'h4')
    const next = copyRole(night, { zone: 'night', role: 'accent' }, { zone: 'day', role: 'alert' })
    expect(next.zones.day.links.alert).toBe('h4')
    expect(next.zones.day.palette.alert.h).toBe(260)
    expect(next.zones.night.links.accent).toBe('h4')
    expect(next.zones.day.links.accent).toBe('h2')
  })

  it('copies a role that has no link as just its hue, clearing the target\'s link', () => {
    const s = two()
    s.zones.night = { ...s.zones.night, palette: { ...s.zones.night.palette, accent: { h: 99 } }, links: { ...s.zones.night.links, accent: undefined } }
    delete s.zones.night.links.accent
    const next = copyRole(s, { zone: 'night', role: 'accent' }, { zone: 'day', role: 'theme' })
    expect(next.zones.day.palette.theme.h).toBe(99)
    expect('theme' in next.zones.day.links).toBe(false)
  })

  it('does nothing onto itself or to or from a zone that is off', () => {
    const s = two()
    expect(copyRole(s, { zone: 'day', role: 'theme' }, { zone: 'day', role: 'theme' })).toBe(s)
    expect(copyRole(s, { zone: 'day', role: 'theme' }, { zone: 'dusk', role: 'theme' })).toBe(s)
    expect(copyRole(s, { zone: 'dusk', role: 'theme' }, { zone: 'day', role: 'theme' })).toBe(s)
  })
})
