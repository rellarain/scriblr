import type { CharacterDoc } from '../../../../api/types'
import { saveBlob } from '../maps/mapExport'
import { appearanceText } from './describe'

// A character sheet as one picture: the name and the profile in words, on white paper, saved as a PNG. (It has no drawing: the portrait is made to be seen in the console, on
// the cards and in the book.)

export const SHEET_W = 1000
export const SHEET_H = 1100

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// A text broken into lines of at most `max` characters, at spaces.
export function wrapText(text: string, max: number): string[] {
  const lines: string[] = []
  for (const para of text.split(/\n+/)) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + word).length > max) { lines.push(line); line = word } else line = line ? `${line} ${word}` : word
    }
    if (line) lines.push(line)
  }
  return lines
}

export function sheetSvg(doc: CharacterDoc): string {
  const p = doc.profile
  const ink = '#1c1226', muted = '#5a4f66'
  const parts: string[] = []
  parts.push(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="#ffffff"/>`)
  parts.push(`<text x="40" y="70" font-family="Georgia, serif" font-size="44" font-weight="700" fill="${ink}">${esc(doc.name)}</text>`)
  const sub = [p.role, p.age && `age ${p.age}`, p.occupation].filter(Boolean).join(' · ')
  if (sub) parts.push(`<text x="40" y="104" font-family="sans-serif" font-size="20" fill="${muted}">${esc(sub)}</text>`)
  let y = 160
  const block = (title: string, text: string, x: number, width: number): number => {
    if (!text.trim()) return 0
    const lines = wrapText(text, Math.floor(width / 9.5))
    let used = 0
    parts.push(`<text x="${x}" y="${y}" font-family="sans-serif" font-size="15" font-weight="700" letter-spacing="1" fill="${muted}">${esc(title.toUpperCase())}</text>`)
    used += 22
    for (const l of lines.slice(0, 7)) { parts.push(`<text x="${x}" y="${y + used}" font-family="sans-serif" font-size="17" fill="${ink}">${esc(l)}</text>`); used += 23 }
    return used + 18
  }
  const left: Array<[string, string]> = [['In a sentence', p.summary], ['Appearance', appearanceText(p)], ['Personality', p.personality], ['Background', p.background]]
  const right: Array<[string, string]> = [['Wants', p.goal], ['Because', p.motivation], ['Fears', p.fear], ['Flaw', p.flaw], ['Strength', p.strength], ...p.fields.map((f): [string, string] => [f.label || 'Note', f.value]), ...(doc.possessions.length > 0 ? [['Carries', doc.possessions.map(x => x.name).filter(Boolean).join(', ')] as [string, string]] : [])]
  let lx = y, rx = y
  for (const [t, v] of left) { y = lx; lx += block(t, v, 40, 440) }
  for (const [t, v] of right) { y = rx; rx += block(t, v, 520, 440) }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}">${parts.join('')}</svg>`
}

// The sheet as a PNG (null when this browser cannot draw it).
export async function sheetPng(doc: CharacterDoc, scale = 1): Promise<Blob | null> {
  const svg = sheetSvg(doc)
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('The sheet could not be drawn.')); img.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = SHEET_W * scale
    canvas.height = SHEET_H * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/png'))
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const sheetFileName = (name: string): string => `${name.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'character'}-sheet.png`

export async function exportSheet(doc: CharacterDoc, scale = 1): Promise<'saved' | 'unavailable'> {
  const blob = await sheetPng(doc, scale)
  if (!blob) return 'unavailable'
  saveBlob(blob, sheetFileName(doc.name))
  return 'saved'
}
