import type { CharacterFigure, ModelContent } from '../../../../../api/types'
import { MASK_BOX, gradientAxis, gradientStops, paintAttrs, paintDefs, type PaintDef, type PaintItem } from '../../../admin/characters/engine/paint'
import type { View } from '../../../admin/characters/engine/rig'
import { saveBlob } from '../../maps/mapExport'
import { readableInk } from '../portrait/colour'
import { drawFigure, type Crop } from './figureState'

// Download the card as a PNG (phase 6c-5): the card the writer is looking at (the frame and the view they chose), with the rounded tile, at 1024 pixels on its longer side; the
// tile may be left out (the figure alone on a transparent background) and the name of the character, with its role and age, can be added under the card on the tile's colour. The
// picture is an SVG written here (the shapes with their own fills, so it needs no stylesheet), drawn on a canvas and saved.

export interface CardOptions {
  // Leave the tile colour out: the figure on a transparent background.
  transparent: boolean
  // The name to write under the card (none: nothing is added), and the line under the name (the role and the age).
  name: string | null
  caption: string
}

const SIZE = 1024
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const num = (n: number): string => String(Math.round(n * 100) / 100)

function defsMarkup(defs: PaintDef[]): string {
  return defs.map(d => {
    if (d.kind === 'gradient') {
      const stops = gradientStops(d.from, d.to, d.reach).map(st => `<stop offset="${st.offset}" stop-color="${esc(st.colour)}"/>`).join('')
      if (d.dir === 'radial') return `<radialGradient id="${d.id}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`
      const a = gradientAxis(d.dir, d.angle)
      return `<linearGradient id="${d.id}" x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}">${stops}</linearGradient>`
    }
    if (d.kind === 'clip') return `<clipPath id="${d.id}">${d.ds.map(x => `<path d="${esc(x)}"/>`).join('')}</clipPath>`
    return `<mask id="${d.id}" maskUnits="userSpaceOnUse" x="${MASK_BOX.x}" y="${MASK_BOX.y}" width="${MASK_BOX.w}" height="${MASK_BOX.h}"><rect x="${MASK_BOX.x}" y="${MASK_BOX.y}" width="${MASK_BOX.w}" height="${MASK_BOX.h}" fill="#fff"/>${d.ds.map(x => `<path d="${esc(x)}" fill="#000"/>`).join('')}</mask>`
  }).join('')
}

// One shape painted, as PaintedPath paints it, but with its fill written on it.
function pathMarkup(item: PaintItem, prefix: string): string {
  const a = paintAttrs(item, prefix)
  const path = `<path d="${esc(item.d)}" fill="${esc(a.fill)}" fill-opacity="${item.blank ? 0 : item.opacity}"${a.clip ? ` clip-path="${a.clip}"` : ''}${a.mask ? ` mask="${a.mask}"` : ''}${a.blend ? ` style="mix-blend-mode:${a.blend}"` : ''}/>`
  const inner = a.comp ? `<g clip-path="${a.comp}">${path}</g>` : path
  return a.wear ? `<g clip-path="${a.wear}">${inner}</g>` : inner
}

const FONT = 'Segoe UI, Helvetica, Arial, sans-serif'
const shorten = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// The card as SVG text, and the size it is drawn at.
export function cardSvg(copy: ModelContent, figure: CharacterFigure, crop: Crop, view: View, o: CardOptions): { svg: string; width: number; height: number } {
  const { box, items, tile } = drawFigure(copy, figure, crop, view, false)
  const scale = SIZE / Math.max(box.w, box.h)
  const w = Math.max(1, Math.round(box.w * scale)), h = Math.max(1, Math.round(box.h * scale))
  const name = o.name?.trim() ? o.name.trim() : null
  const caption = name ? o.caption.trim() : ''
  const strip = name ? Math.round(w * (caption ? 0.24 : 0.17)) : 0
  const total = h + strip
  const radius = Math.round(Math.min(w, total) * 0.08)
  const prefix = 'c'
  const art = `<svg x="0" y="0" width="${w}" height="${h}" viewBox="${num(box.x)} ${num(box.y)} ${num(box.w)} ${num(box.h)}" preserveAspectRatio="xMidYMid meet"><defs>${defsMarkup(paintDefs(items, prefix))}</defs>${items.map(i => pathMarkup(i, prefix)).join('')}</svg>`
  const ink = readableInk(tile)
  const shown = name ? shorten(name, 36) : ''
  const nameSize = Math.round(Math.min(w * 0.07, (w * 0.9) / Math.max(1, shown.length * 0.58)))
  const text = name
    ? `<text x="${w / 2}" y="${Math.round(h + w * 0.11)}" text-anchor="middle" font-family="${FONT}" font-size="${nameSize}" font-weight="700" fill="${ink}">${esc(shown)}</text>`
      + (caption ? `<text x="${w / 2}" y="${Math.round(h + w * 0.19)}" text-anchor="middle" font-family="${FONT}" font-size="${Math.round(w * 0.04)}" fill="${ink}">${esc(shorten(caption, 60))}</text>` : '')
    : ''
  const ground = o.transparent ? '' : `<rect x="0" y="0" width="${w}" height="${total}" fill="${esc(tile)}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${total}" viewBox="0 0 ${w} ${total}"><defs><clipPath id="card"><rect x="0" y="0" width="${w}" height="${total}" rx="${radius}"/></clipPath></defs><g clip-path="url(#card)">${ground}${art}${text}</g></svg>`
  return { svg, width: w, height: total }
}

// The card as a PNG (null when this browser cannot draw it).
export async function cardPng(copy: ModelContent, figure: CharacterFigure, crop: Crop, view: View, o: CardOptions): Promise<Blob | null> {
  const { svg, width, height } = cardSvg(copy, figure, crop, view, o)
  let url = ''
  try {
    url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('The card could not be drawn.')); img.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, width, height)
    return await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/png'))
  } catch {
    return null
  } finally {
    if (url) URL.revokeObjectURL(url)
  }
}

export const cardFileName = (name: string): string => `${name.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'character'}-card.png`

export async function downloadCard(copy: ModelContent, figure: CharacterFigure, crop: Crop, view: View, o: CardOptions, fileName: string): Promise<'saved' | 'unavailable'> {
  const blob = await cardPng(copy, figure, crop, view, o)
  if (!blob) return 'unavailable'
  saveBlob(blob, fileName)
  return 'saved'
}
