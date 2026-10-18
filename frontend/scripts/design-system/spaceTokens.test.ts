import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readStyleFiles } from '../../src/test/readStyles'
import { RADIUS, SPACING } from './tokens'

// The space, size and radius tokens exist twice: as the list the design system publishes (tokens.ts, which becomes tokens.json) and as CSS
// custom properties the stylesheets use (src/theme/_space.scss). They must agree, or the page describes a scale the app does not draw.
function cssTokens(): Record<string, string> {
  const css = readFileSync(path.resolve(__dirname, '../../src/theme/_space.scss'), 'utf-8')
  return Object.fromEntries([...css.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)].map(m => [m[1], m[2].trim()]))
}

describe('the space tokens as CSS custom properties', () => {
  it('are exactly the tokens the design system publishes, with the same values', () => {
    const published = Object.fromEntries([...SPACING, ...RADIUS].map(t => [t.name, t.value]))
    expect(cssTokens()).toEqual(published)
  })
})

describe('the Writer stylesheets use the space scale', () => {
  // A gap or padding written as one of the scale's own pixel values (2, 4, 6, 10, 12, 14, 18) is the token. 8px is the grid's gap
  // (`space-grid`) and is left as a number where it is something else's gap (the scale has no general 8 yet, see known-drift); the other
  // values are off the scale. This keeps a new rule from writing out a number the scale already names.
  const SCALE = new Map([[2, 'space-1'], [4, 'space-2'], [6, 'space-3'], [10, 'space-4'], [12, 'space-5'], [14, 'space-6'], [18, 'space-7']])
  it('write no gap, padding or margin as a pixel value the scale names', () => {
    const offences: string[] = []
    for (const { name, text } of readStyleFiles('assets/Interfaces/writer/writer.scss')) {
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/(?<![\w-])(gap|row-gap|column-gap|padding(?:-top|-right|-bottom|-left)?|margin(?:-top|-right|-bottom|-left)?):\s*([^;{}]+)/g)) {
          if (/[()]/.test(m[2])) continue
          for (const token of m[2].trim().split(/\s+/)) {
            const px = /^(\d+)px$/.exec(token)
            if (px && SCALE.has(Number(px[1]))) offences.push(`${name}:${i + 1}: ${m[1]}: ${m[2].trim()} (use var(--${SCALE.get(Number(px[1]))}))`)
          }
        }
      })
    }
    expect(offences.slice(0, 20)).toEqual([])
  })
})
