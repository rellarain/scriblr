import { zoneColorTokens, ZONE_THEMES, type ColorToken } from './colors'
import { GRID_GAP, ONE_COLUMN_BELOW, RAIL_TILE } from '../../src/components/tiles/tileShapes'
import { SUBCATEGORY_HUE_WINDOW } from '../../src/theme/bookColors'
import { ZONE_KEYS } from '../../src/theme/types'

// project/tokens.json: the system's tokens in the shape the Design System page reads (flat lists of { name, value, usage }; colours
// literal, across the four zones). Colours come from the theme code (colors.ts); the type, spacing, radius and shadow values are the ones
// the Writer's stylesheet (assets/Interfaces/writer/writer.scss) is written with.

const SANS = `system-ui, -apple-system, 'Segoe UI', sans-serif`
const SERIF = `Georgia, 'Times New Roman', serif`

interface TypeStyle { name: string; fontSize: string; lineHeight: string; fontWeight: number; letterSpacing?: string; textTransform?: string; fontStyle?: string }
const px = (n: number) => `${n}px`

const SANS_STYLES: TypeStyle[] = [
  { name: 'label', fontSize: px(10), lineHeight: px(14), fontWeight: 700, letterSpacing: px(1), textTransform: 'uppercase' },
  { name: 'label-small', fontSize: px(9), lineHeight: px(12), fontWeight: 700, letterSpacing: px(1), textTransform: 'uppercase' },
  { name: 'button', fontSize: px(11), lineHeight: px(16), fontWeight: 700 },
  { name: 'ui', fontSize: px(12), lineHeight: px(17), fontWeight: 400 },
  { name: 'field', fontSize: px(13), lineHeight: px(18), fontWeight: 400 },
  { name: 'level-title', fontSize: px(15), lineHeight: px(20), fontWeight: 700 },
  { name: 'console-title', fontSize: px(18), lineHeight: px(24), fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' },
]
const SERIF_STYLES: TypeStyle[] = [
  { name: 'writing-input', fontSize: px(13), lineHeight: px(18), fontWeight: 400 },
  { name: 'writing-note', fontSize: px(13), lineHeight: px(18), fontWeight: 400, fontStyle: 'italic' },
  { name: 'banner-title', fontSize: px(18), lineHeight: px(23), fontWeight: 400 },
  { name: 'chapter-title', fontSize: px(22), lineHeight: px(28), fontWeight: 700 },
  { name: 'draft-text', fontSize: px(16), lineHeight: px(26), fontWeight: 400 },
  { name: 'preview-body', fontSize: px(17), lineHeight: px(28), fontWeight: 400 },
  { name: 'preview-title', fontSize: px(30), lineHeight: px(36), fontWeight: 700 },
]

export interface Token { name: string; value: string; usage: string }

const SPACING: Token[] = [
  { name: 'space-1', value: px(2), usage: 'Hairline gaps: a tab\'s inner gap, the gap between quick actions.' },
  { name: 'space-2', value: px(4), usage: 'Tight gaps: between small controls, a page edge\'s step.' },
  { name: 'space-3', value: px(6), usage: 'The gap between levels and between tiles in a column.' },
  { name: 'space-grid', value: px(GRID_GAP), usage: 'The gap between tiles on the split grid, and the width a divider drags across.' },
  { name: 'space-4', value: px(10), usage: 'The gap between stacked cards and the padding inside a tile body.' },
  { name: 'space-5', value: px(12), usage: 'A level body\'s side padding; the gap between groups of fields.' },
  { name: 'space-6', value: px(14), usage: 'A level header\'s side padding.' },
  { name: 'space-7', value: px(18), usage: 'Dashboard column gaps.' },
  { name: 'tab-size', value: px(30), usage: 'A header tab and quick action: a 30x30 icon button, its icon 18px.' },
  { name: 'header-min', value: px(40), usage: 'The least height of a level\'s header strip.' },
  { name: 'rail-tile', value: px(40), usage: 'A minimised tile\'s icon square in the older tile grid\'s rail.' },
  { name: 'one-column-below', value: px(ONE_COLUMN_BELOW), usage: 'Below this width a split grid stacks its tiles in one column.' },
  { name: 'hue-window', value: String(SUBCATEGORY_HUE_WINDOW), usage: 'Degrees: how far a series, arc, chapter or plot subcategory colour may stray from its parent\'s hue.' },
]
const RADIUS: Token[] = [
  { name: 'radius-none', value: px(0), usage: 'Surfaces and fields are flat and square: levels, tiles (the tile grid and its console too), tabs, cards, notes, fields and the theme panel have no radius; buttons on a level (small and icon buttons) have none either.' },
  { name: 'radius-button', value: px(4), usage: 'Buttons keep a small radius where they have one: the header, a tile title button, the theme panel (6px). They are the only rounded things on a surface.' },
  { name: 'radius-input', value: px(4), usage: 'Inputs and buttons on the paper, and the segmented switch.' },
  { name: 'radius-chip', value: px(12), usage: 'Chips and the chip add box.' },
]
const SHADOW: Token[] = [
  { name: 'shadow-tab', value: '1px 1px 3px rgba(0, 0, 0, 0.3)', usage: 'A page-edge tab (softened by 0.55 in a light zone).' },
  { name: 'shadow-tab-raised', value: '2px 2px 6px rgba(0, 0, 0, 0.4)', usage: 'The open chapter\'s tab and the focused arc\'s tab.' },
  { name: 'shadow-cover', value: '3px 0 8px rgba(0, 0, 0, 0.28)', usage: 'The book cover beside its page edges.' },
  { name: 'shadow-spine', value: '1px 0 3px rgba(0, 0, 0, 0.35)', usage: 'A book spine on the shelf.' },
  { name: 'shadow-save-bubble', value: '0 2px 8px rgba(0, 0, 0, 0.35)', usage: 'The save state bubble on hover. Shadows are for what floats over content (this bubble, the time popover, a page-edge tab); a card is a surface colour and a hairline.' },
]

export function buildTokens(): unknown {
  const perZone = new Map(ZONE_KEYS.map(z => [z, zoneColorTokens(z)]))
  const names = perZone.get('day')!.map(t => t.name)
  const colorTokens = names.map(name => {
    const value: Record<string, string> = {}
    for (const { id } of ZONE_THEMES) value[id] = perZone.get(id)!.find((t: ColorToken) => t.name === name)!.value
    return { name, value, usage: perZone.get('day')!.find(t => t.name === name)!.usage }
  })
  const group = (name: string, family: string, styles: TypeStyle[]) => ({
    name, family,
    styles: styles.map(s => ({ name: s.name, fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight, ...(s.letterSpacing ? { letterSpacing: s.letterSpacing } : {}), ...(s.textTransform ? { textTransform: s.textTransform } : {}), ...(s.fontStyle ? { fontStyle: s.fontStyle } : {}) })),
  })
  return {
    name: 'Scriblr', version: 1,
    color: { themes: ZONE_THEMES.map(({ id, name }) => ({ id, name })), tokens: colorTokens },
    type: {
      fonts: [],
      families: { sans: SANS, serif: SERIF },
      groups: [group('Interface (sans)', 'sans', SANS_STYLES), group('Writing (serif)', 'serif', SERIF_STYLES)],
    },
    spacing: { tokens: SPACING },
    radius: { tokens: RADIUS },
    shadow: { tokens: SHADOW },
  }
}
