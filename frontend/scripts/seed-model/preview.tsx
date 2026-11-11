// Writes an HTML page with the seed model drawn through its frames, next to the old portrait, for a look in the browser: node/vite-node only, never shipped.
import { writeFileSync, mkdirSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CharacterFigure, ModelContent } from '../../src/api/types'
import { Figure } from '../../src/assets/Interfaces/writer/characters/figure/Figure'
import { blankFigure } from '../../src/assets/Interfaces/writer/characters/figure/figureState'
import { Portrait } from '../../src/assets/Interfaces/writer/characters/portrait/Portrait'
import { defaultPortrait } from '../../src/assets/Interfaces/writer/characters/portrait/defaults'

export function figureWith(copy: ModelContent, patch: Partial<CharacterFigure> = {}): CharacterFigure {
  const base = blankFigure('seed', copy)
  const colours: CharacterFigure['colours'] = {}
  const WANT: Record<string, string> = { k_skin: '#d9a07a', k_hair: '#3a2a20', k_eye: '#5a3a24', k_lip: '#c6704c', k_cloth: '#2f4a5a' }
  for (const slot of copy.slots ?? []) { const pick = slot.colours.find(c => c.hex.toLowerCase() === WANT[slot.id]) ?? slot.colours[0]; if (pick) colours[slot.id] = { src: 'colour', id: pick.id } }
  return { ...base, colours, ...patch }
}

// One row per option of a part: the old portrait's face with that option next to the model's.
export function optionSheet(copy: ModelContent, parts: Array<{ object: string; axis: string; key: string; options: Array<{ id: string; name: string }> }>): string {
  return parts.map(p => {
    const cells = p.options.map(o => {
      const old = renderToStaticMarkup(createElement(Portrait, { portrait: { ...defaultPortrait(), [p.key]: o.id } as never, label: '', crop: 'face' as never }))
      const now = renderToStaticMarkup(createElement(Figure, { copy, figure: figureWith(copy, { forms: { [`${p.object}.${p.axis}`]: o.id } }), crop: 'head', label: '' }))
      return `<figure class="pair"><div class="two"><div>${old}</div><div>${now}</div></div><figcaption>${o.name}</figcaption></figure>`
    }).join('')
    return `<h4>${p.object}</h4>${cells}`
  }).join('')
}

export function writePreview(file: string, title: string, copy: ModelContent, extra: Array<{ label: string; figure: Partial<CharacterFigure>; crop?: string }> = [], sheet = '') {
  const draw = (label: string, f: Partial<CharacterFigure>, crop: string | { frame: string }, size: number) => `<figure><div style="width:${size}px">${renderToStaticMarkup(createElement(Figure, { copy, figure: figureWith(copy, f), crop: crop as never, label }))}</div><figcaption>${label}</figcaption></figure>`
  const old = renderToStaticMarkup(createElement(Portrait, { portrait: defaultPortrait(), label: 'The old portrait' }))
  const frames = draw('Whole figure', {}, 'figure', 200) + (copy.frames ?? []).map(fr => draw(fr.name, {}, { frame: fr.id }, 260)).join('')
  const more = extra.map(e => draw(e.label, e.figure, e.crop ?? 'figure', 200)).join('')
  const html = `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:13px system-ui;margin:16px;background:#f3f1ee}figure{display:inline-block;margin:6px;vertical-align:top}figcaption{text-align:center}svg{width:100%;height:auto;display:block}.charFigureShape{fill:var(--shape-fill)}.pair{margin:3px}.two{display:flex;gap:2px;width:210px}.two>div{width:104px}h4{margin:10px 6px 2px}</style><h3>${title}</h3><figure><div style="width:260px">${old}</div><figcaption>The old portrait</figcaption></figure>${frames}<div>${more}</div>${sheet}`
  mkdirSync(file.replace(/[/\\][^/\\]+$/, ''), { recursive: true })
  writeFileSync(file, html)
}
