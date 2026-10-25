import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readStyleFiles } from '../../src/test/readStyles'
import { RADIUS, SANS_STYLES, SERIF_STYLES, SPACING } from './tokens'

// The space, radius and type-size tokens exist twice: as the lists the design system publishes (tokens.ts, which becomes tokens.json) and as
// CSS custom properties the stylesheets use (src/theme/_tokens.scss). They must agree, or the page describes a scale the app does not draw.
function cssTokens(): Record<string, string> {
  const css = readFileSync(path.resolve(__dirname, '../../src/theme/_tokens.scss'), 'utf-8')
  return Object.fromEntries([...css.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)].map(m => [m[1], m[2].trim()]))
}

// Which published type style each `--text-*` size is (several styles can share a size).
const TEXT_TOKENS: Record<string, string> = {
  'text-small': 'button', 'text-ui': 'ui', 'text-field': 'field', 'text-title': 'level-title', 'text-heading': 'console-title',
  'text-draft': 'draft-text', 'text-preview': 'preview-body', 'text-chapter': 'chapter-title', 'text-display': 'preview-title',
}

describe('the tokens as CSS custom properties', () => {
  it('space and radius are exactly the tokens the design system publishes, with the same values', () => {
    const css = cssTokens()
    const own = Object.fromEntries(Object.entries(css).filter(([name]) => !name.startsWith('text-')))
    expect(own).toEqual(Object.fromEntries([...SPACING, ...RADIUS].map(t => [t.name, t.value])))
  })

  it('each type size is the size of the published style it is named for', () => {
    const css = cssTokens()
    const styles = new Map([...SANS_STYLES, ...SERIF_STYLES].map(s => [s.name, s.fontSize]))
    const sizes = Object.fromEntries(Object.entries(css).filter(([name]) => name.startsWith('text-')))
    expect(Object.keys(sizes).sort()).toEqual(Object.keys(TEXT_TOKENS).sort())
    for (const [token, style] of Object.entries(TEXT_TOKENS)) expect(sizes[token], `${token} is ${style}`).toBe(styles.get(style))
  })
})

// The values a stylesheet writes that a token already names. A new rule that writes the number again fails here.
function declarations(text: string, properties: string): Array<{ prop: string; value: string; line: number }> {
  const out: Array<{ prop: string; value: string; line: number }> = []
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(new RegExp(`(?<![\\w-])(${properties}):\\s*([^;{}]+)`, 'g'))) out.push({ prop: m[1], value: m[2].trim(), line: i + 1 })
  })
  return out
}

describe('the Writer stylesheets use the tokens', () => {
  const files = readStyleFiles('assets/Interfaces/writer/writer.scss')

  const SPACE = new Map([[2, 'space-1'], [4, 'space-2'], [6, 'space-3'], [8, 'space-base'], [10, 'space-4'], [12, 'space-5'], [14, 'space-6'], [18, 'space-7']])
  it('write no gap, padding or margin as a pixel value the space scale names', () => {
    const offences: string[] = []
    for (const { name, text } of files) {
      for (const d of declarations(text, 'gap|row-gap|column-gap|padding(?:-top|-right|-bottom|-left)?|margin(?:-top|-right|-bottom|-left)?')) {
        if (/[()]/.test(d.value)) continue
        for (const token of d.value.split(/\s+/)) {
          const px = /^(\d+)px$/.exec(token)
          if (px && SPACE.has(Number(px[1]))) offences.push(`${name}:${d.line}: ${d.prop}: ${d.value} (use var(--${SPACE.get(Number(px[1]))}))`)
        }
      }
    }
    expect(offences.slice(0, 20)).toEqual([])
  })

  it('write no radius as 0 or 4px, and no radius off the scale (3, 6 or 8px)', () => {
    const offences: string[] = []
    for (const { name, text } of files) {
      for (const d of declarations(text, 'border-radius')) {
        if (/^(0|0px|4px|3px|6px|8px)(\s*!important)?$/.test(d.value)) offences.push(`${name}:${d.line}: border-radius: ${d.value}`)
      }
    }
    expect(offences.slice(0, 20)).toEqual([])
  })

  const TEXT = new Map(Object.entries(TEXT_TOKENS).map(([token, style]) => [[...SANS_STYLES, ...SERIF_STYLES].find(s => s.name === style)!.fontSize, token]))
  it('write no font size as a pixel value a type token names', () => {
    const offences: string[] = []
    for (const { name, text } of files) {
      for (const d of declarations(text, 'font-size')) {
        if (TEXT.has(d.value)) offences.push(`${name}:${d.line}: font-size: ${d.value} (use var(--${TEXT.get(d.value)}))`)
      }
    }
    expect(offences.slice(0, 20)).toEqual([])
  })

  // The Plot contents' drawer (the compact layout) is the level's own dark fill laid over a light tile whose ink is dark: without the level's ink
  // set on it, its label, circles and buttons were near-black on dark green (about 1.7:1). The audit covers white on that fill.
  it('give the Plot contents drawer, which stands on a level fill inside a light tile, the level ink', () => {
    const plot = files.find(f => f.name === 'styles/_plot.scss')!.text
    const rule = /\.wrPlotBarDrawer\s*\{([\s\S]*?)\n  \}/.exec(plot)?.[1] ?? ''
    expect(rule).toMatch(/background:\s*var\(--wr-fill-2\)/)
    expect(rule).toMatch(/(?<![\w-])color:\s*var\(--on-accent\)/)
  })

  // The system's floor for text is 11px (the `label` and `button` styles): nothing in the Writer, the app shell (the helper's and admin's
  // screens) or the admin Resources and Plot presets sheets is set smaller. (The sky toggle's date, the Reader's markers and the theme timeline are still
  // under it, see known-drift.)
  it('set no text under 11px', () => {
    const small: string[] = []
    for (const { name, text } of [...files, ...readStyleFiles('App.scss'), ...readStyleFiles('assets/Interfaces/admin/resources/resources.scss'), ...readStyleFiles('assets/Interfaces/admin/plot/plotPresets.scss')]) {
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/(?<![\w-])font-size:\s*(\d+(?:\.\d+)?)px|(?<![\w-])font:\s*[\w ]*?(\d+(?:\.\d+)?)px/g)) {
          const size = Number(m[1] ?? m[2])
          if (size < 11) small.push(`${name}:${i + 1}: ${m[0]}`)
        }
      })
    }
    expect(small.slice(0, 20)).toEqual([])
  })
})
