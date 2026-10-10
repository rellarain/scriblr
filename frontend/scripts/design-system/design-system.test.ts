import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARD_META } from '../../src/designSystem/cardMeta'
import { PROJECT_DIR, SYSTEM_DIR, generateStatic } from './generate'

// The design system's committed files (docs/design-system) are generated from the app's code and must be current; the tokens must be in the
// shape the Design System page reads; the hand-written pages must exist and link to things that exist. Regenerate with `npm run design-system`.

const generated = generateStatic()
const read = (rel: string) => readFileSync(path.join(SYSTEM_DIR, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('the generated files', () => {
  it.each(Object.keys(generated))('%s is current', rel => {
    expect(existsSync(path.join(SYSTEM_DIR, rel))).toBe(true)
    expect(read(rel)).toBe(generated[rel].replace(/\r\n/g, '\n'))
  })

  it('leaves no icon behind that the code no longer draws', () => {
    const onDisk = readdirSync(path.join(PROJECT_DIR, 'assets/Icons')).sort()
    const expected = Object.keys(generated).filter(k => k.startsWith('project/assets/Icons/')).map(k => path.basename(k)).sort()
    expect(onDisk).toEqual(expected)
  })

  it('has a preview and a guideline page for every card, and a cover', () => {
    for (const card of CARD_META) {
      expect(existsSync(path.join(PROJECT_DIR, 'components', card.dir, 'README.md'))).toBe(true)
      expect(read(`project/components/${card.dir}/preview.html`)).toContain(`mountCard(document.getElementById('root'), '${card.id}')`)
    }
    expect(read('project/components/Cover/preview.html')).toMatch(/^<!-- @dsCard height=\d+ -->/)
    // The cover is a bare folder: a README beside it would make it an ordinary component.
    expect(existsSync(path.join(PROJECT_DIR, 'components/Cover/README.md'))).toBe(false)
  })
})

interface Token { name: string; value: string | Record<string, string>; usage?: string }
const tokens = JSON.parse(read('project/tokens.json')) as {
  color: { themes: Array<{ id: string; name: string }>; tokens: Token[] }
  type: { fonts: unknown[]; families: Record<string, string>; groups: Array<{ name: string; family: string; styles: Array<Record<string, unknown>> }> }
  spacing: { tokens: Token[] }
  radius: { tokens: Token[] }
  shadow: { tokens: Token[] }
}

const COLOR = /^(#[0-9a-f]{6}([0-9a-f]{2})?|#[0-9a-f]{3,4}|(rgb|rgba|hsl|hsla)\([0-9 ,.%/-]+\))$/
const LENGTH = /^(-?\d+(\.\d+)?(px|rem|em|%)?|0)$/

describe('tokens.json, in the shape the Design System page reads', () => {
  it('has the four zones as colour themes, Day first', () => {
    expect(tokens.color.themes.map(t => t.id)).toEqual(['day', 'dawn', 'dusk', 'night'])
  })

  it('has every colour in every zone as a literal value (no var(), color-mix() or named colour)', () => {
    for (const t of tokens.color.tokens) {
      expect(typeof t.value).toBe('object')
      for (const theme of tokens.color.themes) {
        const v = (t.value as Record<string, string>)[theme.id]
        expect(v, `${t.name} in ${theme.id}`).toMatch(COLOR)
      }
    }
  })

  it('names each token once across colour, spacing, radius and shadow, with a usage note on each', () => {
    const all = [...tokens.color.tokens, ...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.shadow.tokens]
    const names = all.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const t of all) {
      expect(t.name).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/)
      expect((t.usage ?? '').length, `${t.name} has a usage note`).toBeGreaterThan(10)
    }
  })

  it('has spacing and radius as lengths', () => {
    for (const t of [...tokens.spacing.tokens, ...tokens.radius.tokens]) expect(String(t.value), t.name).toMatch(LENGTH)
  })

  it('has the two type families, and styles whose sizes are lengths', () => {
    expect(Object.keys(tokens.type.families).sort()).toEqual(['sans', 'serif'])
    for (const f of Object.values(tokens.type.families)) expect(f).not.toMatch(/[;{}<>\\()]/)
    for (const g of tokens.type.groups) {
      expect(Object.keys(tokens.type.families)).toContain(g.family)
      for (const s of g.styles) expect(String(s.fontSize)).toMatch(LENGTH)
    }
  })

  it('stays within the page\'s caps', () => {
    expect(tokens.color.tokens.length).toBeLessThanOrEqual(600)
    expect(tokens.spacing.tokens.length).toBeLessThanOrEqual(60)
    expect(tokens.shadow.tokens.length).toBeLessThanOrEqual(60)
    expect(statSync(path.join(PROJECT_DIR, 'tokens.json')).size).toBeLessThan(512 * 1024)
  })

  it('has the ink readable on the surface in every zone (the one pair the page shows first)', () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    }
    const byName = (n: string) => tokens.color.tokens.find(t => t.name === n)!.value as Record<string, string>
    for (const theme of tokens.color.themes) {
      const a = lum(byName('ink')[theme.id])
      const b = lum(byName('surface-base')[theme.id])
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the hand-written pages', () => {
  const pages = readdirSync(PROJECT_DIR).filter(f => f.endsWith('.md'))

  it('has a brand book and at most 24 sections', () => {
    expect(pages).toContain('README.md')
    expect(pages.length).toBeLessThanOrEqual(24)
    const readme = read('project/README.md')
    expect(readme.startsWith('#'), 'the page carries the system name: no title in the README').toBe(false)
  })

  it('starts each page with a heading', () => {
    for (const p of pages.filter(f => f !== 'README.md')) expect(read(`project/${p}`)).toMatch(/^# \S/)
  })

  it('links only to pages and files that exist', () => {
    const files = [...pages.map(p => path.join(PROJECT_DIR, p)), ...CARD_META.map(c => path.join(PROJECT_DIR, 'components', c.dir, 'README.md'))]
    const missing: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf-8')
      for (const m of text.matchAll(/\]\(([^)#]+?)(#[^)]*)?\)/g)) {
        const target = m[1]
        if (/^[a-z]+:/i.test(target)) continue
        if (!existsSync(path.resolve(path.dirname(file), target))) missing.push(`${path.relative(SYSTEM_DIR, file)} -> ${target}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('has a guideline page for every component with its summary as the first sentence', () => {
    for (const card of CARD_META) {
      const readme = read(`project/components/${card.dir}/README.md`)
      expect(readme.startsWith('# ')).toBe(true)
      expect(readme.split('\n').find(l => l.trim() && !l.startsWith('#'))!.length).toBeGreaterThan(30)
    }
  })
})
