import { describe, expect, it } from 'vitest'
import { DEFAULT_PREVIEW_FORMAT, FONT_STACKS, formatOf, formatVars } from './previewFormat'

describe('previewFormat', () => {
  it('is the default look for a book with no format, and fills in what a partial one leaves out', () => {
    expect(formatOf(undefined)).toEqual(DEFAULT_PREVIEW_FORMAT)
    expect(formatOf({ previewFormat: null })).toEqual(DEFAULT_PREVIEW_FORMAT)
    expect(formatOf({ previewFormat: { ...DEFAULT_PREVIEW_FORMAT, fontSize: 21, fontFamily: 'mono' } })).toMatchObject({ fontSize: 21, fontFamily: 'mono', lineSpacing: 1.65 })
  })

  it('becomes the variables the preview page reads', () => {
    const vars = formatVars({ ...DEFAULT_PREVIEW_FORMAT, fontFamily: 'sans', fontSize: 20, fontStyle: 'italic', fontWeight: 'bold', textAlign: 'left', lineSpacing: 2, paragraphIndent: 1.5, paragraphSpacing: 0.5 }) as Record<string, string>
    expect(vars).toMatchObject({
      '--wr-pv-font': FONT_STACKS.sans, '--wr-pv-size': '20px', '--wr-pv-style': 'italic', '--wr-pv-weight': 'bold',
      '--wr-pv-align': 'left', '--wr-pv-line': '2', '--wr-pv-indent': '1.5em', '--wr-pv-gap': '0.5em',
    })
  })
})
