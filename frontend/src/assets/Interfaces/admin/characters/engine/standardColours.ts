import type { ModelColour, ModelGenre, ModelSlot, ModelSwatch } from '../../../../../api/types'

// What a new model starts with (and what "Add the standard slots" adds): the genre tags, a starter palette, and the colour slots with the default colours of the
// portrait engine's own swatches (copied here, so the model does not depend on the portrait code, which is to be retired). Natural colours fit every genre; the
// fantasy ones are tagged Fantasy. All of it is plain data an admin may change or delete.

export const standardGenres = (): ModelGenre[] => [
  { id: 'g_fiction', name: 'Fiction' },
  { id: 'g_fantasy', name: 'Fantasy' },
  { id: 'g_nonfiction', name: 'Non-fiction' },
]

export const starterPalette = (): ModelSwatch[] => [
  { id: 'k1', name: 'Warm', h: 24, s: 46 },
  { id: 'k2', name: 'Rose', h: 350, s: 52 },
  { id: 'k3', name: 'Ink blue', h: 222, s: 38 },
  { id: 'k4', name: 'Moss', h: 104, s: 30 },
  { id: 'k5', name: 'Gold', h: 42, s: 68 },
]

const SKIN = ['#f6dcc8', '#f1c7a5', '#e8b48f', '#e6c39a', '#d9a07a', '#c9a074', '#c68a63', '#b07650', '#9a6142', '#855034', '#6e3f28', '#5a311f', '#46261a', '#3a1f16']
const SKIN_FANTASY = ['#aebfd0', '#6f94bf', '#4f9a96', '#7ea65e', '#5d7a3a', '#9d9ea4', '#6b6b74', '#8a6aa8', '#c0a8d8', '#b5473a', '#d6b04a', '#f3efea', '#e49aae', '#3d3d4a']
const EYE = ['#2d1b12', '#4a2e1f', '#6b4226', '#8a6a3a', '#b08d57', '#3e6b5a', '#5b7f3a', '#2f4a7a', '#6a8fb3', '#7a7f86']
const EYE_FANTASY = ['#8a5ab0', '#d6789a', '#d6b030', '#b02a2a', '#c4c8cf', '#f0f0f0', '#3fe0e0', '#9be03a', '#e0802a', '#111111']
const HAIR = ['#111111', '#2b1d16', '#4a3022', '#6b4428', '#8a5a33', '#b8864b', '#d9b26b', '#ecd9a6', '#8f3a1e', '#b5482a', '#9a9a9a', '#e2e0dc']
const LIP = ['#d08a7a', '#c47a6a', '#b46a5e', '#9c4f45', '#8a4a44', '#6e3a35', '#9c2f3a', '#5e2e28']
const CLOTH = ['#2f4a5a', '#802020', '#3e5a3a', '#d9d2c0', '#2b2b33', '#c9a227', '#5a3e6b', '#8a4a2a', '#2f6a6a', '#e8c3c3']
const SHOE = ['#1a1a1a', '#3b2a20', '#5a3e2b', '#2f3a4a', '#6b6b6b', '#d9d2c0']

function colours(prefix: string, natural: readonly string[], fantasy: readonly string[] = []): ModelColour[] {
  return [
    ...natural.map((hex, i): ModelColour => ({ id: `c_${prefix}_${i + 1}`, name: '', hex, genres: [] })),
    ...fantasy.map((hex, i): ModelColour => ({ id: `c_${prefix}_f${i + 1}`, name: '', hex, genres: ['g_fantasy'] })),
  ]
}

export const standardSlots = (): ModelSlot[] => [
  { id: 'k_skin', name: 'Skin', lMin: 10, lRest: 60, lMax: 94, aMin: 100, aRest: 100, aMax: 100, colours: colours('skin', SKIN, SKIN_FANTASY) },
  { id: 'k_hair', name: 'Hair', lMin: 4, lRest: 26, lMax: 96, aMin: 60, aRest: 100, aMax: 100, colours: colours('hair', HAIR) },
  { id: 'k_eye', name: 'Eye', lMin: 4, lRest: 38, lMax: 96, aMin: 100, aRest: 100, aMax: 100, colours: colours('eye', EYE, EYE_FANTASY) },
  { id: 'k_lip', name: 'Lip', lMin: 20, lRest: 56, lMax: 85, aMin: 60, aRest: 100, aMax: 100, colours: colours('lip', LIP) },
  { id: 'k_cloth', name: 'Clothing', lMin: 10, lRest: 44, lMax: 92, aMin: 100, aRest: 100, aMax: 100, colours: colours('cloth', CLOTH) },
  { id: 'k_shoe', name: 'Shoes', lMin: 6, lRest: 16, lMax: 86, aMin: 100, aRest: 100, aMax: 100, colours: colours('shoe', SHOE) },
]
