// Writes an HTML page with old portraits next to what Convert makes of them (the basic model through its bust frame), and the lines the preview would list. For a look in the
// browser: node/vite-node only, never shipped. Usage: npx vite-node scripts/seed-model/convert-preview.tsx [out-dir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CharacterPortrait, FigureModel, ModelContent } from '../../src/api/types'
import { seededRng } from '../../src/assets/Interfaces/admin/characters/engine/previews'
import { Figure } from '../../src/assets/Interfaces/writer/characters/figure/Figure'
import { convertLines, convertPortrait } from '../../src/assets/Interfaces/writer/characters/figure/figureConvert'
import { defaultPortrait } from '../../src/assets/Interfaces/writer/characters/portrait/defaults'
import { Portrait } from '../../src/assets/Interfaces/writer/characters/portrait/Portrait'
import { randomPortrait } from '../../src/assets/Interfaces/writer/characters/portrait/random'

const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] ?? join(tmpdir(), 'scriblr-convert-preview')
const content: ModelContent = JSON.parse(readFileSync(resolve(here, '../../../backend/app/seed/basic_model.json'), 'utf-8'))
const model: FigureModel = { id: 'aabbccddeeff', modelId: 'basic', version: 1, name: 'Adult (basic)', publishedAt: null, content }

const base = defaultPortrait()
const cases: Array<{ label: string; portrait: CharacterPortrait }> = [
  { label: 'The default portrait', portrait: base },
  { label: 'Long curly hair, 3B', portrait: { ...base, hairLength: 'chest', hairTexture: '3B', hairColor: '#7a3a1a' } },
  { label: 'Hip-length straight, bangs', portrait: { ...base, hairLength: 'hip', hairTexture: '1A', hairFront: 'bangs', hairColor: '#d9b04a' } },
  { label: 'Two braids', portrait: { ...base, hairLength: 'chest', hairStyle: 'twobraids', hairTexture: '2B' } },
  { label: 'Afro, 4C', portrait: { ...base, hairStyle: 'triangle', hairTexture: '4C', hairLength: 'chin', skin: '#7a4f33' } },
  { label: 'Mohawk', portrait: { ...base, hairStyle: 'mohawk', hairLength: 'short', hairColor: '#b02a2a' } },
  { label: 'Bald with a beard', portrait: { ...base, hairLength: 'bald', facialHair: 'full', age: 'middle' } },
  { label: 'A child', portrait: { ...base, age: 'child', hairLength: 'chin', skin: '#e8b898' } },
  { label: 'Elderly, grey', portrait: { ...base, age: 'elderly', hairLength: 'shoulder', build: 'slight', hairColor: '#2a2a2a' } },
  { label: 'Elf with a crown and a staff', portrait: { ...base, fantasyEars: 'elf', crown: 'tiara', heldItem: 'staff', heldSide: 'right', hairLength: 'hip', hairColor: '#e8d890', eyeColor: '#3fe0e0' } },
  { label: 'Horned, hooded, lantern on the left', portrait: { ...base, horns: 'ram', hornColor: '#5a4636', hood: 'hood', hoodColor: '#4a3f5e', heldItem: 'lantern', heldSide: 'left', skin: '#6f94bf' } },
  { label: 'Scroll, necklace, wide eyes', portrait: { ...base, heldItem: 'scroll', necklace: 'pearls', eyes: 'wide', expression: 'surprised', top: 'vneck', topColor: '#802020' } },
]
const rng = seededRng(7)
for (let i = 0; i < 12; i++) cases.push({ label: `Random ${i + 1}`, portrait: randomPortrait(base, [], rng) })

// Every picture rendered on its own gets the same ids from React, and on one page a clip or a mask would reach the first picture's: each gets ids of its own.
let pictures = 0
const own = (svg: string): string => { const k = `p${++pictures}_`; return svg.replace(/id="/g, `id="${k}`).replace(/url\(#/g, `url(#${k}`).replace(/href="#/g, `href="#${k}`) }
const row = (c: (typeof cases)[number]): string => {
  const r = convertPortrait(c.portrait, model)
  const old = own(renderToStaticMarkup(createElement(Portrait, { portrait: c.portrait, label: '', crop: 'card' as never })))
  const now = own(renderToStaticMarkup(createElement(Figure, { copy: content, figure: r.figure, crop: 'bust', label: '' })))
  const whole = own(renderToStaticMarkup(createElement(Figure, { copy: content, figure: r.figure, crop: 'figure', label: '' })))
  const lines = convertLines(r).map(l => `<li>${l}</li>`).join('')
  return `<section><h4>${c.label}</h4><div class="r"><div class="a">${old}</div><div class="a">${now}</div><div class="w">${whole}</div><ul>${lines}</ul></div></section>`
}
const html = `<!doctype html><meta charset="utf-8"><title>Convert</title><style>body{font:13px system-ui;margin:16px;background:#f3f1ee}section{margin:0 0 14px}h4{margin:0 0 4px}.r{display:flex;gap:10px;align-items:flex-start}.a{width:220px}.w{width:110px}.a svg,.w svg{width:100%;height:auto;display:block}ul{margin:0;padding-left:16px;font-size:12px;max-width:420px}.charFigureShape{fill:var(--shape-fill)}</style>${cases.map(row).join('')}`
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'index.html'), html)
console.log(`wrote ${out}/index.html (${cases.length} portraits)`)
