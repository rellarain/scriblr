import type { CSSProperties } from 'react'
import type { PreviewFormat } from '../../../api/types'

// How a book's chapters are laid out in the Draft level's preview. A book with no format of its own
// has these (the preview's own look); the backend validates the same bounds (PreviewFormat).
export const DEFAULT_PREVIEW_FORMAT: PreviewFormat = {
  fontFamily: 'serif', fontSize: 17, fontStyle: 'normal', fontWeight: 'normal', textAlign: 'justify',
  lineSpacing: 1.65, paragraphIndentSpaces: 0, paragraphSpacing: 0,
}

export const FONT_STACKS: Record<PreviewFormat['fontFamily'], string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
}

export const FORMAT_LIMITS = {
  fontSize: { min: 10, max: 32, step: 1 },
  lineSpacing: { min: 1, max: 3, step: 0.05 },
  paragraphIndentSpaces: { min: 0, max: 16, step: 1 },
  paragraphSpacing: { min: 0, max: 3, step: 0.25 },
} as const

// How wide one space is in each font family, as a fraction of the font size: a paragraph indent is a number of spaces, drawn as that many
// times this width (the backend has the same table, SPACE_EM in storage/schema.py, to turn the old em indents into spaces).
export const SPACE_EM: Record<PreviewFormat['fontFamily'], number> = { serif: 0.25, sans: 0.28, mono: 0.6 }

export const indentEm = (format: PreviewFormat): number => Math.round(format.paragraphIndentSpaces * SPACE_EM[format.fontFamily] * 1000) / 1000

export const formatOf = (book: { previewFormat?: PreviewFormat | null } | undefined): PreviewFormat =>
  ({ ...DEFAULT_PREVIEW_FORMAT, ...(book?.previewFormat ?? {}) })

// The format as CSS variables on the preview page (the stylesheet reads them).
export function formatVars(format: PreviewFormat): CSSProperties {
  return {
    '--wr-pv-font': FONT_STACKS[format.fontFamily],
    '--wr-pv-size': `${format.fontSize}px`,
    '--wr-pv-style': format.fontStyle,
    '--wr-pv-weight': format.fontWeight,
    '--wr-pv-align': format.textAlign,
    '--wr-pv-line': String(format.lineSpacing),
    '--wr-pv-indent': `${indentEm(format)}em`,
    '--wr-pv-gap': `${format.paragraphSpacing}em`,
  } as CSSProperties
}
