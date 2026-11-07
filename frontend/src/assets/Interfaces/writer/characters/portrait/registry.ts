import type { CharacterPortrait } from '../../../../../api/types'
import type { PortraitCrop } from './crops'
import type { SliderKey } from './defaults'
import {
  AGES, BROWS, BUILDS, CHESTS, EARS, EDGES, ENDS, EXPRESSIONS, EYES, FACIAL, FRONTS, GREYING, HAIRLINES, HAIRLINE_HEIGHTS, HEADS, LENGTHS, MOUTHS, NOSES, PLACEMENTS, STYLES, TEXTURES, TOPS,
  endsFor, frontsFor, pick, placementsFor, stylesFor, type Option,
} from './library'

// What the portrait is made of, as the controls and the comparisons see it: the parts that are chosen from a list, the colours, the sliders, and for each its label and its
// swatches. Nothing here draws or renders.

export type PartKey =
  | 'age' | 'build' | 'chest' | 'headShape' | 'ears' | 'expression' | 'eyes' | 'brows' | 'nose' | 'mouth'
  | 'hairLength' | 'hairTexture' | 'hairStyle' | 'hairFront' | 'hairline' | 'hairlineHeight' | 'hairEdges' | 'hairEnds' | 'hairPlacement' | 'greying' | 'facialHair' | 'top'
export type ColourKey = 'skin' | 'eyeColor' | 'browColor' | 'lipColor' | 'hairColor' | 'highlightColor' | 'facialHairColor' | 'topColor' | 'tileColor'

// Every part in the order a description or a comparison reads them.
export const PART_KEYS: PartKey[] = [
  'age', 'build', 'chest', 'headShape', 'ears', 'expression', 'eyes', 'brows', 'nose', 'mouth',
  'hairLength', 'hairTexture', 'hairStyle', 'hairFront', 'hairline', 'hairlineHeight', 'hairEdges', 'hairEnds', 'hairPlacement', 'greying', 'facialHair', 'top',
]

export const PART_LABELS: Record<PartKey, string> = {
  age: 'Age', build: 'Build', chest: 'Chest', headShape: 'Head shape', ears: 'Ears', expression: 'Expression', eyes: 'Eyes', brows: 'Brows', nose: 'Nose', mouth: 'Mouth',
  hairLength: 'Length', hairTexture: 'Texture', hairStyle: 'Style', hairFront: 'Front', hairline: 'Hairline', hairlineHeight: 'Hairline height', hairEdges: 'Edges', hairEnds: 'Ends', hairPlacement: 'Placement', greying: 'Greying',
  facialHair: 'Facial hair', top: 'Top',
}
// The longer name of a part where the label alone is not enough (a comparison says "Hair length", not "Length").
export const PART_NAMES: Record<PartKey, string> = { ...PART_LABELS, hairLength: 'Hair length', hairTexture: 'Hair texture', hairStyle: 'Hair style', hairFront: 'Hair front', hairEdges: 'Hair edges', hairEnds: 'Hair ends', hairPlacement: 'Hair placement', greying: 'Hair greying' }

export const COLOUR_LABELS: Record<ColourKey, string> = {
  skin: 'Skin', eyeColor: 'Eye colour', browColor: 'Brow colour', lipColor: 'Lip colour', hairColor: 'Hair colour', highlightColor: 'Highlights', facialHairColor: 'Facial hair colour',
  topColor: 'Top colour', tileColor: 'Tile colour',
}

export const SLIDER_LABELS: Record<SliderKey, string> = {
  headWidth: 'Head width', eyeSize: 'Eye size', eyeSpacing: 'Eye spacing', eyeTilt: 'Eye tilt', noseSize: 'Nose size', noseWidth: 'Nose width', mouthSize: 'Mouth size', shoulderWidth: 'Shoulder width', neckWidth: 'Neck width',
}

const LISTS: Record<PartKey, readonly Option[]> = {
  age: AGES, build: BUILDS, chest: CHESTS, headShape: HEADS, ears: EARS, expression: EXPRESSIONS, eyes: EYES, brows: BROWS, nose: NOSES, mouth: MOUTHS,
  hairLength: LENGTHS, hairTexture: TEXTURES, hairStyle: STYLES, hairFront: FRONTS, hairline: HAIRLINES, hairlineHeight: HAIRLINE_HEIGHTS, hairEdges: EDGES, hairEnds: ENDS, hairPlacement: PLACEMENTS, greying: GREYING,
  facialHair: FACIAL, top: TOPS,
}
// The id an unknown choice falls back to, for the parts whose list does not start with it.
const FALLBACKS: Partial<Record<PartKey, string>> = { age: 'adult', hairLength: 'short', hairTexture: '1B' }

// What a dropdown offers for a part now: the whole list, except that the styles and the fronts are only those the hair's length (and style) allow.
export function optionsFor(key: PartKey, p: CharacterPortrait): readonly Option[] {
  if (key === 'hairStyle') return stylesFor(p)
  if (key === 'hairFront') return frontsFor(p)
  if (key === 'hairEnds') return endsFor(p)
  if (key === 'hairPlacement') return placementsFor(p)
  return LISTS[key]
}
// The name of a choice (an id the library does not know is shown as it is).
export function optionName(key: PartKey, id: string): string {
  const found = LISTS[key].find(o => o.id === id)
  return found ? found.name : pick(LISTS[key], id, FALLBACKS[key]).name
}

// The picture each dropdown draws its choices as: the part of the portrait it changes.
export const PART_CROPS: Record<PartKey, PortraitCrop> = {
  age: 'card', build: 'card', chest: 'card', headShape: 'head', ears: 'ears', expression: 'face', eyes: 'eyes', brows: 'brows', nose: 'nose', mouth: 'mouth',
  hairLength: 'card', hairTexture: 'card', hairStyle: 'card', hairFront: 'head', hairline: 'head', hairlineHeight: 'head', hairEdges: 'head', hairEnds: 'card', hairPlacement: 'card', greying: 'head', facialHair: 'lower', top: 'card',
}

// The portrait a dropdown draws its pictures on: this character, with what the part needs to show (bald hair has no hairline to look at, and a child has no beard).
export function previewBase(key: PartKey, p: CharacterPortrait): CharacterPortrait {
  const length = LENGTHS.findIndex(l => l.id === p.hairLength)
  const hairShows = length < 2 ? { hairLength: 'short' } : {}
  const longer = length < 2 ? { hairLength: 'chin' } : {}
  const young = ['infant', 'toddler', 'child'].includes(p.age)
  switch (key) {
    case 'headShape': return { ...p, hairLength: 'bald', facialHair: 'none' }
    case 'ears': return { ...p, hairLength: 'buzzed' }
    case 'hairLength': return { ...p, hairStyle: 'plain' }
    case 'hairTexture': case 'hairStyle': return { ...p, ...longer }
    case 'hairFront': return { ...p, ...hairShows }
    case 'hairline': case 'hairlineHeight': case 'hairEdges': return { ...p, ...hairShows, hairStyle: 'plain', hairFront: 'none' }
    case 'facialHair': return young ? { ...p, age: 'adult' } : p
    default: return p
  }
}

// Swatches: a row of quick colours for each kind of colour (the picker beside them takes any colour).
export const SWATCHES = {
  skin: ['#f6dcc8', '#f1c7a5', '#e8b48f', '#e6c39a', '#d9a07a', '#c9a074', '#c68a63', '#b07650', '#9a6142', '#855034', '#6e3f28', '#5a311f', '#46261a', '#3a1f16'],
  eye: ['#2d1b12', '#4a2e1f', '#6b4226', '#8a6a3a', '#b08d57', '#3e6b5a', '#5b7f3a', '#2f4a7a', '#6a8fb3', '#7a7f86'],
  hair: ['#111111', '#2b1d16', '#4a3022', '#6b4428', '#8a5a33', '#b8864b', '#d9b26b', '#ecd9a6', '#8f3a1e', '#b5482a', '#9a9a9a', '#e2e0dc'],
  highlight: ['#d9b26b', '#c9a063', '#b5482a', '#3a5fb0', '#b03a7a', '#5bb08a'],
  lip: ['#d08a7a', '#c47a6a', '#b46a5e', '#9c4f45', '#8a4a44', '#6e3a35', '#9c2f3a', '#5e2e28'],
  cloth: ['#2f4a5a', '#802020', '#3e5a3a', '#d9d2c0', '#2b2b33', '#c9a227', '#5a3e6b', '#8a4a2a', '#2f6a6a', '#e8c3c3'],
  tile: ['#e6d6c3', '#cfe0dc', '#e9d39a', '#d9e6f2', '#cfd8e8', '#e7c9b8', '#d5dde2', '#ece0c8', '#f0d4c4', '#cfe0c8', '#d9d0ec', '#f2dcc0'],
} as const
