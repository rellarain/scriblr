import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
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

  it('covers the theme surfaces, the fills, the paper, the reactions, the edge tabs and the level panels in all four zones', () => {
    for (const zone of ZONES) {
      const groups = new Set(rows.filter(r => r.zone === zone).map(r => r.group))
      expect([...groups].sort()).toEqual(['Edge tabs', 'Fills', 'Level panels', 'Paper', 'Reactions', 'Theme surfaces'])
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
    const css = readFileSync(path.resolve(__dirname, '../assets/Interfaces/writer/writer.scss'), 'utf-8')
    const low = css.split(String.fromCharCode(10))
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /font-size/.test(line) && !/disabled|dragging|hover/.test(line))
      .filter(([, line]) => [...line.matchAll(/opacity: 0\.(\d+)/g)].some(m => Number(`0.${m[1]}`) < 0.8))
    expect(low.map(([n, line]) => `${n}: ${line.trim().slice(0, 70)}`)).toEqual([])
  })
})
