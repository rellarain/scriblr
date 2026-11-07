import type { CharacterPortrait } from '../../../../../api/types'
import { colourName, type ColourKind } from '../describe'
import { PORTRAIT_RANGES, type SliderKey } from './defaults'
import { COLOUR_LABELS, PART_KEYS, PART_NAMES, SLIDER_LABELS, optionName, type ColourKey } from './registry'

// How two portraits differ, as lines ("Hair style: Plain > Full braids"): the parts that are another choice, the colours (as words, or as the colours when the words are the same),
// and the sliders that moved by a tenth (or by three degrees, for the tilt of the eyes). The tile colour is not a difference of the person.

// Each colour: how to name it, and what a missing one (a colour that follows another) is called.
const COLOURS: Array<[ColourKey, ColourKind, string]> = [
  ['skin', 'skin', ''], ['eyeColor', 'eye', ''], ['hairColor', 'hair', ''], ['highlightColor', 'hair', 'none'], ['browColor', 'hair', 'like the hair'], ['lipColor', 'cloth', 'natural'],
  ['facialHairColor', 'hair', 'like the hair'], ['topColor', 'cloth', ''],
]
const SLIDERS: SliderKey[] = ['headWidth', 'eyeSize', 'eyeSpacing', 'noseSize', 'noseWidth', 'mouthSize']

export function portraitDiff(a: CharacterPortrait, b: CharacterPortrait): string[] {
  const lines: string[] = []
  for (const key of PART_KEYS) if (a[key] !== b[key]) lines.push(`${PART_NAMES[key]}: ${optionName(key, a[key])} > ${optionName(key, b[key])}`)
  for (const [key, kind, none] of COLOURS) {
    const x = a[key], y = b[key]
    if (x === y) continue
    const nameX = x ? colourName(x, kind) : none, nameY = y ? colourName(y, kind) : none
    lines.push(`${COLOUR_LABELS[key]}: ${nameX === nameY ? `${x ?? none} > ${y ?? none}` : `${nameX} > ${nameY}`}`)
  }
  for (const key of SLIDERS) if (Math.abs(a[key] - b[key]) >= 0.1) lines.push(`${SLIDER_LABELS[key]}: ${Math.round(a[key] * 100)}% > ${Math.round(b[key] * 100)}%`)
  if (Math.abs(a.eyeTilt - b.eyeTilt) >= 3) lines.push(`${SLIDER_LABELS.eyeTilt}: ${Math.round(a.eyeTilt)}° > ${Math.round(b.eyeTilt)}°`)
  return lines
}

// Kept so a slider range is looked up in one place when a comparison needs it.
export const sliderRange = (key: SliderKey): readonly [number, number] => PORTRAIT_RANGES[key]
