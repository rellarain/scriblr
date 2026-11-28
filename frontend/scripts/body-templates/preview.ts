// A page of the built body templates as the app draws them (front and back, with their outlines per edge), to look them over after a build.
// Usage: npx vite-node scripts/body-templates/preview.ts <templates.json> <out.html>
import { readFileSync, writeFileSync } from 'node:fs'
import type { ModelContent } from '../../src/api/types'
import { NO_COLOURING } from '../../src/assets/Interfaces/admin/characters/engine/colour'
import { OUTLINE_INK, drawable, paintShapes } from '../../src/assets/Interfaces/admin/characters/engine/paint'
import { defaultValues, solve } from '../../src/assets/Interfaces/admin/characters/engine/rig'

const [src, out] = process.argv.slice(2)
const data = JSON.parse(readFileSync(src, 'utf-8')) as { templates: Array<{ id: string; name: string; content: ModelContent }> }
const colouring = { ...NO_COLOURING }
function figure(c: ModelContent, view: 'front' | 'back'): string {
  const solved = solve(c, defaultValues(c), view)
  return drawable(paintShapes(c, solved, colouring)).map(i => {
    const fill = `<path d="${i.d}" fill="${i.fill}" fill-opacity="${i.opacity}"/>`
    const d = i.lineD ?? i.d
    return fill + (i.line && d ? `<path d="${d}" fill="none" stroke="${OUTLINE_INK}" stroke-width="${i.line.w}" stroke-linejoin="round"/>` : '')
  }).join('')
}
const cards = data.templates.map(t => `<figure><svg viewBox="0 0 200 440" width="118" height="260"><rect width="200" height="440" fill="#e6d6c3"/>${figure(t.content, 'front')}</svg>`
  + `<svg viewBox="0 0 200 440" width="118" height="260"><rect width="200" height="440" fill="#e6d6c3"/>${figure(t.content, 'back')}</svg><figcaption>${t.name}</figcaption></figure>`).join('')
// close-ups of the first template: the face, the left hand, the left foot, the back's shoulders
const crop = (c: ModelContent, view: 'front' | 'back', box: [number, number, number, number]) =>
  `<svg viewBox="${box.join(' ')}" width="170" height="${Math.round((170 * box[3]) / box[2])}"><rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="#e6d6c3"/>${figure(c, view)}</svg>`
const closeups = data.templates.slice(0, 2).map(t => `<div>${crop(t.content, 'front', [78, 22, 44, 40])}${crop(t.content, 'front', [166, 225, 30, 52])}${crop(t.content, 'front', [100, 390, 30, 44])}</div>`).join('')
writeFileSync(out.replace(/\.html$/, '-closeups.html'), `<!doctype html><meta charset="utf-8"><title>Close-ups</title><style>body{margin:0;background:#f4efe9}svg{display:inline-block;vertical-align:top}</style>${closeups}`)
writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Body templates</title><style>body{font:14px system-ui;background:#f4efe9;margin:4px}figure{display:inline-block;margin:2px}svg{display:inline-block}figcaption{text-align:center}</style>${cards}`)
console.log(`wrote ${out}`)
