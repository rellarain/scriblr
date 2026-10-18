import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readStyles } from '../test/readStyles'
import { fillCap, fillHsl, tabColors } from './bookColors'
import { audit, levelRatios, MIN_RATIO, paletteRatios, ZONES } from './contrastAudit'
import { worstLevelRatio } from './levelContrast'
import { TEXT_TARGET, ratioOf } from './readable'

// Text is always readable: every pair the design system documents, in every zone, for every hue the user can pick.
const rows = audit()

describe('the contrast audit', () => {
  it('finds every documented pair readable in every zone, whatever the hues', () => {
    const failing = rows.filter(r => !r.pass).map(r => `${r.zone} ${r.id}: ${r.worst.toFixed(2)}:1 (needs ${r.min}) at ${r.worstAt}`)
    expect(failing).toEqual([])
  })

  it('holds text to 4.5:1 and icons and control edges to 3:1', () => {
    expect(MIN_RATIO).toEqual({ text: 4.5, large: 3, ui: 3 })
    for (const r of rows) expect(r.min).toBe(MIN_RATIO[r.kind])
  })

  it('covers the theme surfaces, hover and press, the fills, the paper, the preview page, the reactions, the edge tabs, the sky toggle, the Inbox tones, the plot colours, the Theme panel and the level panels in all four zones', () => {
    for (const zone of ZONES) {
      const groups = new Set(rows.filter(r => r.zone === zone).map(r => r.group))
      expect([...groups].sort()).toEqual(['Edge tabs', 'Fills', 'Hover and pressed', 'Inbox tones', 'Level panels', 'Paper', 'Plot colours', 'Preview page', 'Reactions', 'Sky toggle', 'Theme panel', 'Theme surfaces'])
    }
  })

  it('names each pair once per zone', () => {
    for (const zone of ZONES) {
      const ids = rows.filter(r => r.zone === zone).map(r => r.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('measures the default hues too, with no pair under its threshold', () => {
    for (const zone of ZONES) {
      for (const p of [...paletteRatios(zone), ...levelRatios(zone, 32)]) expect(p.ratio).toBeGreaterThanOrEqual(MIN_RATIO[p.kind])
    }
  })
})

describe('level panel fills', () => {
  it('are held dark enough for white text, by hue: yellows and greens darker than blues and reds', () => {
    expect(fillCap(60)).toBeLessThan(fillCap(240))
    expect(fillCap(120)).toBeLessThan(fillCap(0))
    for (let h = 0; h < 360; h += 5) {
      expect(fillCap(h)).toBeLessThanOrEqual(38)
      expect(worstLevelRatio(fillHsl(h, { s: 80, l: 42 }))).toBeGreaterThanOrEqual(TEXT_TARGET)
    }
  })

  it('stay at the zone\'s own lightness where that already reads (a blue or a red in the day)', () => {
    expect(fillHsl(240, { s: 80, l: 42 }).l).toBe(34)
    expect(fillHsl(0, { s: 80, l: 42 }).l).toBe(34)
  })
})

describe('edge tab colours', () => {
  it('fit the ink to read on a level colour, in every zone, for any level and book hue', () => {
    for (const zone of ZONES) {
      for (let hue = 0; hue < 360; hue += 20) {
        const t = tabColors(zone, hue, (hue + 40) % 360)
        expect(ratioOf(t.ink, t.bg)).toBeGreaterThanOrEqual(TEXT_TARGET)
      }
    }
  })
})

describe('the Writer stylesheet', () => {
  // Quiet text is the ink at 90% (the audit measures 90% on a level and 88% on the paper); a rule that sets a size and a lower opacity would
  // show text the audit does not cover. Icons, disabled and dragged states are not text and have none of this.
  it('sets no text at an opacity under 0.8', () => {
    const css = readStyles('assets/Interfaces/writer/writer.scss')
    const low = css.split(String.fromCharCode(10))
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /font-size/.test(line) && !/disabled|dragging|hover/.test(line))
      .filter(([, line]) => [...line.matchAll(/opacity: 0\.(\d+)/g)].some(m => Number(`0.${m[1]}`) < 0.8))
    expect(low.map(([n, line]) => `${n}: ${line.trim().slice(0, 70)}`)).toEqual([])
  })

  // A black or white wash written out at a fixed alpha does not follow the zone (white on a light zone is invisible, black does not soften):
  // recesses are --ov-sink-1..3 and lifts --ov-lift-1..3. Shadows, gradients and the scrim are not washes.
  it.each(['assets/Interfaces/writer/writer.scss', 'App.scss', 'assets/Interfaces/admin/resources/resources.scss'])(
    'writes no black or white wash at a fixed alpha in %s',
    file => {
      const css = readStyles(file)
      const washes = css.split(String.fromCharCode(10))
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => !/box-shadow|linear-gradient|text-shadow/.test(line))
        .filter(([, line]) => /rgba?\(\s*(0[ ,]+0[ ,]+0|255[ ,]+255[ ,]+255)\b/.test(line))
      expect(washes.map(([n, line]) => `${n}: ${line.trim().slice(0, 70)}`)).toEqual([])
    },
  )
})

describe('the Writer stylesheet is an index of its partials', () => {
  it('loads every partial in styles/, and the scanners above read them all', () => {
    const index = readStyles('assets/Interfaces/writer/writer.scss')
    const uses = [...index.matchAll(/@use '\.\/styles\/([\w-]+)'/g)].map(m => m[1])
    const partials = readdirSync(path.resolve(__dirname, '../assets/Interfaces/writer/styles'))
      .filter(name => name.endsWith('.scss') && name !== '_mixins.scss')
      .map(name => name.replace(/^_|\.scss$/g, ''))
    // A partial that is not loaded styles nothing; a load without a partial fails the build.
    expect([...uses].sort()).toEqual([...partials].sort())
    // The scan sees the rules, not just the index (the Writer has well over a thousand lines of them).
    expect(index.split('\n').length).toBeGreaterThan(1000)
  })
})
