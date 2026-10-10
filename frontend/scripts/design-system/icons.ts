import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as icons from '../../src/assets/icons'
import { ReactionHeartIcon, type IconProps } from '../../src/assets/icons'

// assets/Icons/*.svg: every icon of src/assets/icons/index.tsx drawn at 24px (viewBox 24, stroke 1.8, round caps), plus the six reaction hearts.
// An <img> cannot inherit a colour, so the files carry a plain dark ink; in the app they take the current text colour.

const INK = '#2b2430'

const kebab = (name: string) => name.replace(/Icon$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

function svg(element: ReturnType<typeof createElement>): string {
  const markup = renderToStaticMarkup(element)
  return markup.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" color="${INK}" `)
}

export function buildIcons(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(icons)) {
    if (!/Icon$/.test(name) || typeof value !== 'function' || name === 'ReactionHeartIcon') continue
    out[`${kebab(name)}.svg`] = svg(createElement(value as ComponentType<IconProps>, { size: 24 })) + '\n'
  }
  for (const kind of ['like', 'dislike'] as const) {
    for (const level of [1, 2, 3] as const) out[`reaction-${kind}-${level}.svg`] = svg(createElement(ReactionHeartIcon, { kind, level, size: 24 })) + '\n'
  }
  return out
}

export const ICONS_README = `# Icons

Every icon the app draws, as SVG: a 24 by 24 grid, a 1.8 stroke, round caps and joins, no fill (the reaction hearts fill their solid levels).
In the app they take the current text colour (\`stroke="currentColor"\`); these files are drawn in one ink, \`#2b2430\`, because an image cannot inherit a colour (they show only through an \`<img>\`).

Sizes in use: 14 (tile titles), 16 (small buttons, segmented switch), 18 (header tabs and quick actions), 21 (the default).

\`reaction-like-1\` to \`-3\` and \`reaction-dislike-1\` to \`-3\` are the six reaction hearts: a like is an outline, two concentric outlines, a filled heart; a dislike is an outline with a line down its middle, two separate outlined halves, two separate filled halves.
`
