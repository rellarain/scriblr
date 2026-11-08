// The fantasy elements and the jewellery of the portrait: every choice with the numbers it is drawn from (an id names an entry; `pick` gives the entry, and the first, "none",
// for an id this build does not know). The first entry of each list is the usual (nothing added).

import type { Option } from './library'

// Ears that are not human: where the tip lies, as a multiple of the ear's width (`tipX`) and of its height from the top of the ear (`tipY`, negative is above it).
export interface FantasyEar extends Option { w: number; h: number; tipX: number; tipY: number; lobe: number; fin?: boolean }
export const FANTASY_EARS: FantasyEar[] = [
  { id: 'none', name: 'As on the head', w: 1, h: 1, tipX: 1, tipY: 0, lobe: 1 },
  { id: 'pointed', name: 'Pointed', w: 1.2, h: 1, tipX: 1.05, tipY: -0.14, lobe: 0.5 },
  { id: 'elf', name: 'Elf', w: 1.7, h: 1.1, tipX: 1.15, tipY: -0.42, lobe: 0.4 },
  { id: 'longelf', name: 'Long elf', w: 2.3, h: 1.15, tipX: 1.2, tipY: -0.8, lobe: 0.3 },
  { id: 'goblin', name: 'Goblin', w: 2.2, h: 1.35, tipX: 1.15, tipY: 0.26, lobe: 0.8 },
  { id: 'bat', name: 'Bat', w: 1.4, h: 1.7, tipX: 0.86, tipY: -0.55, lobe: 0.2 },
  { id: 'fin', name: 'Fins', w: 1.7, h: 1.2, tipX: 1.1, tipY: -0.2, lobe: 0.3, fin: true },
]

export const HORNS: Option[] = [
  { id: 'none', name: 'None' },
  { id: 'nubs', name: 'Small horns' },
  { id: 'devil', name: 'Curved horns' },
  { id: 'ram', name: 'Ram horns' },
  { id: 'bull', name: 'Bull horns' },
  { id: 'long', name: 'Long swept horns' },
  { id: 'unicorn', name: 'Unicorn horn' },
  { id: 'antlers', name: 'Small antlers' },
  { id: 'stag', name: 'Stag antlers' },
  { id: 'brow', name: 'Brow spikes' },
]

// How the eyes are drawn: the usual, glowing (a bright iris with a halo and no dark pupil), solid (the colour fills the whole eye), two colours (the picture's left eye has the
// second colour), slit (a cat's) or goat (a horizontal) pupil, and blank white.
export const EYE_STYLES: Option[] = [
  { id: 'normal', name: 'Usual' },
  { id: 'glowing', name: 'Glowing' },
  { id: 'solid', name: 'Solid colour' },
  { id: 'twocolour', name: 'Two colours' },
  { id: 'slit', name: 'Slit pupils' },
  { id: 'goat', name: 'Goat pupils' },
  { id: 'blank', name: 'Blank white' },
]
// How many eyes there are, and where the extra ones are.
export const EYE_COUNTS: Option[] = [
  { id: 'two', name: 'Two' },
  { id: 'one', name: 'One eye' },
  { id: 'third', name: 'A third eye' },
  { id: 'four', name: 'Four eyes' },
  { id: 'six', name: 'Six eyes' },
  { id: 'cheeks', name: 'Two more, on the cheeks' },
  { id: 'temples', name: 'Two more, at the temples' },
]

export const CROWNS: Option[] = [
  { id: 'none', name: 'None' },
  { id: 'circlet', name: 'Circlet' },
  { id: 'gem', name: 'Gem circlet' },
  { id: 'diadem', name: 'Diadem' },
  { id: 'tiara', name: 'Tiara' },
  { id: 'laurel', name: 'Laurel wreath' },
  { id: 'flowers', name: 'Flower crown' },
  { id: 'spikes', name: 'Spiked crown' },
  { id: 'royal', name: 'Royal crown' },
]

// The hoods that cover the head (the hood down lies on the shoulders and covers nothing).
export const HOODED = ['hood', 'deep', 'pointed', 'cowl']
export const HOODS: Option[] = [
  { id: 'none', name: 'None' },
  { id: 'hood', name: 'Hood up' },
  { id: 'deep', name: 'Deep hood' },
  { id: 'pointed', name: 'Pointed hood' },
  { id: 'cowl', name: 'Cowl' },
  { id: 'down', name: 'Hood down' },
]

export const ITEMS: Option[] = [
  { id: 'none', name: 'None' },
  { id: 'staff', name: 'Staff' },
  { id: 'crook', name: 'Crooked staff' },
  { id: 'crystal', name: 'Crystal staff' },
  { id: 'wand', name: 'Wand' },
  { id: 'book', name: 'Closed book' },
  { id: 'openbook', name: 'Open book' },
  { id: 'scroll', name: 'Scroll' },
  { id: 'lantern', name: 'Lantern' },
  { id: 'torch', name: 'Torch' },
  { id: 'candle', name: 'Candle' },
  { id: 'goblet', name: 'Goblet' },
  { id: 'flower', name: 'Flower' },
  { id: 'quill', name: 'Quill' },
]
// The hand that holds it: as you look at the portrait.
export const HELD_SIDES: Option[] = [
  { id: 'right', name: 'Right of the picture' },
  { id: 'left', name: 'Left of the picture' },
]

export const NECKLACES: Option[] = [
  { id: 'none', name: 'None' },
  { id: 'chain', name: 'Fine chain' },
  { id: 'choker', name: 'Choker' },
  { id: 'beads', name: 'Beads' },
  { id: 'pearls', name: 'Pearls' },
  { id: 'pendant', name: 'Round pendant' },
  { id: 'amulet', name: 'Gem amulet' },
  { id: 'locket', name: 'Locket' },
  { id: 'medallion', name: 'Medallion' },
  { id: 'torc', name: 'Torc' },
]

// Quick colours for the fantasy choices (the picker beside them takes any colour).
export const FANTASY_SWATCHES = {
  skin: ['#aebfd0', '#6f94bf', '#4f9a96', '#7ea65e', '#5d7a3a', '#9d9ea4', '#6b6b74', '#8a6aa8', '#c0a8d8', '#b5473a', '#d6b04a', '#f3efea', '#e49aae', '#3d3d4a'],
  eye: ['#8a5ab0', '#d6789a', '#d6b030', '#b02a2a', '#c4c8cf', '#f0f0f0', '#3fe0e0', '#9be03a', '#e0802a', '#111111'],
  horn: ['#d8cdb4', '#a89878', '#5a4636', '#2b2622', '#c9c2b0', '#8a8f96', '#b5473a', '#d9b04a'],
  metal: ['#d9b04a', '#cfa83f', '#c0c0c0', '#b87333', '#8a8f96', '#f0e6c8', '#3a3a44', '#b5473a'],
  hood: ['#4a3f5e', '#2f4a5a', '#3e5a3a', '#802020', '#2b2b33', '#5c4a32', '#8a8f96', '#d9d2c0'],
  item: ['#8a5a2b', '#5c3d1e', '#d9b04a', '#c0c0c0', '#802020', '#2f4a7a', '#3e5a3a', '#5a3e6b', '#2b2b33', '#f2eee4'],
} as const
