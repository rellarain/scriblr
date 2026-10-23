import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PREVIEW_FORMAT, FONT_STACKS, FORMAT_LIMITS, SPACE_EM, formatOf, formatVars, indentEm } from './previewFormat'

describe('previewFormat', () => {
  it('is the default look for a book with no format, and fills in what a partial one leaves out', () => {
    expect(formatOf(undefined)).toEqual(DEFAULT_PREVIEW_FORMAT)
    expect(formatOf({ previewFormat: null })).toEqual(DEFAULT_PREVIEW_FORMAT)
    expect(formatOf({ previewFormat: { ...DEFAULT_PREVIEW_FORMAT, fontSize: 21, fontFamily: 'mono' } })).toMatchObject({ fontSize: 21, fontFamily: 'mono', lineSpacing: 1.65 })
  })

  it('becomes the variables the preview page reads', () => {
    const vars = formatVars({ ...DEFAULT_PREVIEW_FORMAT, fontFamily: 'sans', fontSize: 20, fontStyle: 'italic', fontWeight: 'bold', textAlign: 'left', lineSpacing: 2, paragraphIndentSpaces: 5, paragraphSpacing: 0.5 }) as Record<string, string>
    expect(vars).toMatchObject({
      '--wr-pv-font': FONT_STACKS.sans, '--wr-pv-size': '20px', '--wr-pv-style': 'italic', '--wr-pv-weight': 'bold',
      '--wr-pv-align': 'left', '--wr-pv-line': '2', '--wr-pv-indent': '1.4em', '--wr-pv-gap': '0.5em',
    })
  })
})

describe('the paragraph indent in spaces', () => {
  it('is that many spaces wide in the book\'s font', () => {
    const at = (fontFamily: 'serif' | 'sans' | 'mono', paragraphIndentSpaces: number) => indentEm({ ...DEFAULT_PREVIEW_FORMAT, fontFamily, paragraphIndentSpaces })
    expect(at('serif', 0)).toBe(0)
    expect(at('serif', 4)).toBe(1)
    expect(at('serif', 16)).toBe(4)
    expect(at('sans', 5)).toBe(1.4)
    expect(at('mono', 3)).toBe(1.8)
  })

  it('is a whole number of spaces from 0 to 16', () => {
    expect(FORMAT_LIMITS.paragraphIndentSpaces).toEqual({ min: 0, max: 16, step: 1 })
    expect(DEFAULT_PREVIEW_FORMAT.paragraphIndentSpaces).toBe(0)
  })

  // The backend turns a book's old em indent into spaces with its own table of space widths; the two tables must be the same one.
  it('uses the same space widths as the backend', () => {
    const schema = readFileSync(path.resolve(__dirname, '../../../../../backend/app/storage/schema.py'), 'utf-8')
    const table = /SPACE_EM\s*=\s*\{([^}]*)\}/.exec(schema)?.[1] ?? ''
    const backend = Object.fromEntries([...table.matchAll(/"(\w+)":\s*([\d.]+)/g)].map(m => [m[1], Number(m[2])]))
    expect(backend).toEqual(SPACE_EM)
    expect(/MAX_INDENT_SPACES\s*=\s*(\d+)/.exec(schema)?.[1]).toBe(String(FORMAT_LIMITS.paragraphIndentSpaces.max))
  })
})
