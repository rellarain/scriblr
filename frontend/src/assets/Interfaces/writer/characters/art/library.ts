// The face part library: for each part, the options the author chooses from, as numbers the drawing reads (see head.tsx). An id that is not here falls back to
// the first entry (a look from a newer build still draws). Head space: the centre of the head is (0, 0), the top of the skull is y = -50, the chin y = 50.

export interface Option { id: string; name: string }
export const pick = <T extends Option>(list: readonly T[], id: string | null | undefined): T => list.find(o => o.id === id) ?? list[0]

// ---- the head ----
// The right half of the outline, from the top of the skull to the chin: (half width, y). The left half mirrors it.
export interface HeadShape extends Option { pts: Array<[number, number]> }
export const HEAD_SHAPES: readonly HeadShape[] = [
  { id: 'oval', name: 'Oval', pts: [[0, -50], [20, -48], [32, -33], [36, -8], [34, 14], [26, 33], [13, 46], [0, 50]] },
  { id: 'round', name: 'Round', pts: [[0, -48], [24, -46], [37, -30], [41, -4], [38, 18], [29, 38], [15, 49], [0, 51]] },
  { id: 'square', name: 'Square', pts: [[0, -50], [24, -49], [35, -39], [38, -10], [38, 20], [34, 40], [22, 49], [0, 50]] },
  { id: 'heart', name: 'Heart', pts: [[0, -50], [22, -48], [36, -35], [39, -12], [33, 12], [22, 34], [10, 48], [0, 52]] },
  { id: 'long', name: 'Long', pts: [[0, -52], [18, -50], [28, -36], [31, -8], [30, 20], [24, 40], [12, 51], [0, 54]] },
  { id: 'diamond', name: 'Diamond', pts: [[0, -50], [17, -46], [30, -30], [39, -4], [30, 22], [20, 38], [10, 48], [0, 51]] },
  { id: 'pear', name: 'Pear', pts: [[0, -50], [18, -48], [27, -36], [30, -10], [35, 16], [33, 34], [18, 47], [0, 50]] },
  { id: 'narrow', name: 'Narrow', pts: [[0, -50], [16, -48], [26, -33], [29, -6], [27, 18], [20, 36], [10, 47], [0, 50]] },
]

// ---- ears ---- (`w` and `h` in head units, `point` how far the tip rises above the top of the ear, `lobe` how long the lobe hangs)
export interface EarKind extends Option { w: number; h: number; point: number; lobe: number }
export const EARS: readonly EarKind[] = [
  { id: 'small', name: 'Small', w: 7, h: 15, point: 0, lobe: 2 },
  { id: 'round', name: 'Round', w: 10, h: 17, point: 0, lobe: 3 },
  { id: 'large', name: 'Large', w: 13, h: 22, point: 0, lobe: 4 },
  { id: 'lobed', name: 'Long lobes', w: 8, h: 18, point: 0, lobe: 9 },
  { id: 'pointed', name: 'Pointed', w: 9, h: 17, point: 11, lobe: 1 },
  { id: 'elfin', name: 'Long and pointed', w: 8, h: 20, point: 22, lobe: 1 },
]

// ---- eyes ---- (`rx` half width, `top` and `bottom` how far the lids reach, `iris` radius, `lash` the weight of the upper lid, `lift` the outer corner up)
export interface EyeKind extends Option { rx: number; top: number; bottom: number; iris: number; lash: number; lift: number }
export const EYES: readonly EyeKind[] = [
  { id: 'round', name: 'Round', rx: 7, top: 6, bottom: 5, iris: 4.2, lash: 1.2, lift: 0 },
  { id: 'almond', name: 'Almond', rx: 8, top: 4.6, bottom: 3.6, iris: 3.8, lash: 1.4, lift: 1.5 },
  { id: 'wide', name: 'Wide', rx: 8, top: 7, bottom: 6, iris: 4.8, lash: 1.1, lift: 0 },
  { id: 'narrow', name: 'Narrow', rx: 8, top: 3.2, bottom: 2.6, iris: 3.2, lash: 1.5, lift: 0.5 },
  { id: 'droopy', name: 'Droopy', rx: 7.5, top: 4.8, bottom: 5, iris: 4, lash: 1.2, lift: -2.5 },
  { id: 'upturned', name: 'Upturned', rx: 8, top: 4.2, bottom: 3.2, iris: 3.6, lash: 1.6, lift: 3.5 },
  { id: 'hooded', name: 'Hooded', rx: 8, top: 3.4, bottom: 4.4, iris: 3.8, lash: 2.2, lift: 0 },
  { id: 'large', name: 'Large', rx: 9, top: 8, bottom: 6.5, iris: 5.4, lash: 1.2, lift: 0 },
]

// ---- brows ---- (`arch` how high the middle rises, `thick` the weight, `len` half length, `angle` the tilt, outer end up)
export interface BrowKind extends Option { arch: number; thick: number; len: number; angle: number }
export const BROWS: readonly BrowKind[] = [
  { id: 'soft', name: 'Soft', arch: 2.5, thick: 2.4, len: 9, angle: 0 },
  { id: 'straight', name: 'Straight', arch: 0.4, thick: 2.6, len: 9.5, angle: 0 },
  { id: 'arched', name: 'Arched', arch: 5, thick: 2.2, len: 9, angle: 3 },
  { id: 'thick', name: 'Thick', arch: 1.8, thick: 4.4, len: 10, angle: 0 },
  { id: 'thin', name: 'Thin', arch: 3, thick: 1.2, len: 9, angle: 2 },
  { id: 'angled', name: 'Angled', arch: 3.5, thick: 2.8, len: 9.5, angle: 7 },
  { id: 'bushy', name: 'Bushy', arch: 1.5, thick: 5.6, len: 11, angle: -1 },
  { id: 'none', name: 'None', arch: 0, thick: 0, len: 0, angle: 0 },
]

// ---- noses ---- (`z` how far the tip stands out, `len` from the bridge to the tip, `w` the width of the wings, `bridge` the width of the bridge, `hook` a bend down at the tip)
export interface NoseKind extends Option { z: number; len: number; w: number; bridge: number; hook: number }
export const NOSES: readonly NoseKind[] = [
  { id: 'straight', name: 'Straight', z: 14, len: 20, w: 7, bridge: 2.4, hook: 0 },
  { id: 'button', name: 'Button', z: 10, len: 13, w: 6, bridge: 2, hook: -1 },
  { id: 'long', name: 'Long', z: 17, len: 26, w: 6.5, bridge: 2.6, hook: 0 },
  { id: 'wide', name: 'Wide', z: 12, len: 18, w: 10, bridge: 3.6, hook: 0 },
  { id: 'hooked', name: 'Hooked', z: 17, len: 24, w: 7, bridge: 3, hook: 4 },
  { id: 'snub', name: 'Snub', z: 9, len: 12, w: 7, bridge: 2, hook: -3 },
  { id: 'broad', name: 'Broad', z: 14, len: 20, w: 11, bridge: 4.4, hook: 0 },
  { id: 'pointed', name: 'Pointed', z: 16, len: 22, w: 5.5, bridge: 2, hook: 1 },
]

// ---- mouths ---- (`w` half width, `upper` and `lower` the thickness of the lips, `cupid` the dip in the upper lip)
export interface MouthKind extends Option { w: number; upper: number; lower: number; cupid: number }
export const MOUTHS: readonly MouthKind[] = [
  { id: 'medium', name: 'Medium', w: 11, upper: 2.6, lower: 3.6, cupid: 1 },
  { id: 'thin', name: 'Thin', w: 11, upper: 1.4, lower: 1.8, cupid: 0.4 },
  { id: 'full', name: 'Full', w: 12, upper: 3.6, lower: 5, cupid: 1.4 },
  { id: 'wide', name: 'Wide', w: 15, upper: 2.6, lower: 3.4, cupid: 0.8 },
  { id: 'small', name: 'Small', w: 7.5, upper: 2.4, lower: 3.2, cupid: 1 },
  { id: 'heart', name: 'Cupid bow', w: 10, upper: 3.4, lower: 4.2, cupid: 2.4 },
]

// ---- facial hair ---- (`beard` the beard grows on the cheeks and jaw, `reach` how far it hangs below the chin, `stache` the moustache's weight (0: none), `stubble` a shadow
// instead of hair, `patch` a tuft below the lip, `chops` sideburns down to the jaw, `curl` the ends of the moustache curl up)
export interface FacialHairKind extends Option { beard: number; reach: number; stache: number; stubble: boolean; patch: number; chops: number; curl: number }
export const FACIAL_HAIR: readonly FacialHairKind[] = [
  { id: 'none', name: 'None', beard: 0, reach: 0, stache: 0, stubble: false, patch: 0, chops: 0, curl: 0 },
  { id: 'stubble', name: 'Stubble', beard: 1, reach: 0, stache: 1, stubble: true, patch: 0, chops: 0, curl: 0 },
  { id: 'moustache', name: 'Moustache', beard: 0, reach: 0, stache: 1, stubble: false, patch: 0, chops: 0, curl: 0 },
  { id: 'handlebar', name: 'Handlebar', beard: 0, reach: 0, stache: 1.4, stubble: false, patch: 0, chops: 0, curl: 1 },
  { id: 'goatee', name: 'Goatee', beard: 0, reach: 6, stache: 1, stubble: false, patch: 1, chops: 0, curl: 0 },
  { id: 'soulpatch', name: 'Soul patch', beard: 0, reach: 0, stache: 0, stubble: false, patch: 1, chops: 0, curl: 0 },
  { id: 'chops', name: 'Mutton chops', beard: 0, reach: 0, stache: 1, stubble: false, patch: 0, chops: 1, curl: 0 },
  { id: 'full', name: 'Full beard', beard: 1, reach: 8, stache: 1, stubble: false, patch: 0, chops: 1, curl: 0 },
  { id: 'long', name: 'Long beard', beard: 1, reach: 30, stache: 1, stubble: false, patch: 0, chops: 1, curl: 0 },
]

// ---- expressions ---- (`lift` the brows rise, `tilt` the inner ends down (angry) or up (sad), `eye` how open the eyes are, `curve` the mouth smiles (+) or frowns (-),
// `open` how far the mouth is open, `skew` one side of the mouth higher)
export interface Expression extends Option { lift: number; tilt: number; eye: number; curve: number; open: number; skew: number }
export const EXPRESSIONS: readonly Expression[] = [
  { id: 'neutral', name: 'Neutral', lift: 0, tilt: 0, eye: 1, curve: 0, open: 0, skew: 0 },
  { id: 'happy', name: 'Happy', lift: 2, tilt: -2, eye: 0.85, curve: 0.8, open: 0.2, skew: 0 },
  { id: 'laughing', name: 'Laughing', lift: 3, tilt: -3, eye: 0.45, curve: 1, open: 0.85, skew: 0 },
  { id: 'sad', name: 'Sad', lift: 2, tilt: -10, eye: 0.85, curve: -0.7, open: 0, skew: 0 },
  { id: 'angry', name: 'Angry', lift: -3, tilt: 14, eye: 0.8, curve: -0.5, open: 0.12, skew: 0 },
  { id: 'surprised', name: 'Surprised', lift: 7, tilt: 0, eye: 1.3, curve: 0, open: 0.7, skew: 0 },
  { id: 'smirk', name: 'Smirk', lift: 1, tilt: 3, eye: 0.9, curve: 0.45, open: 0, skew: 1 },
  { id: 'worried', name: 'Worried', lift: 3, tilt: -9, eye: 1, curve: -0.3, open: 0, skew: 0 },
  { id: 'sleepy', name: 'Sleepy', lift: -1, tilt: 0, eye: 0.35, curve: 0.05, open: 0, skew: 0 },
  { id: 'scared', name: 'Scared', lift: 6, tilt: -8, eye: 1.3, curve: -0.4, open: 0.55, skew: 0 },
]

// ---- hair ----
// `top` how far the hair stands above the scalp, `side` how far it reaches out past the head, `hairline` the y of the front edge, `fringe` its kind, `drop` where the locks
// at the sides and the mass at the back end for the shortest and the longest hair (head y; null: none), `tail` an element behind or on top, `texture` the edge, `shaved` the
// sides cut away.
export type Fringe = 'none' | 'bangs' | 'side' | 'swoop' | 'curtain' | 'spiky' | 'quiff' | 'messy'
export type Tail = 'none' | 'pony' | 'braid' | 'bun' | 'pigtails'
export type Texture = 'straight' | 'wavy' | 'curly' | 'coily'
export interface HairStyle extends Option {
  bald?: boolean; top: number; side: number; hairline: number; fringe: Fringe
  sideDrop: [number, number] | null; backDrop: [number, number] | null; tail: Tail; texture: Texture; shaved?: 'sides' | 'mohawk'
}
export const HAIR: readonly HairStyle[] = [
  { id: 'short', name: 'Short', top: 6, side: 3, hairline: -29, fringe: 'side', sideDrop: [-6, -2], backDrop: [10, 18], tail: 'none', texture: 'straight' },
  { id: 'bald', name: 'Bald', bald: true, top: 0, side: 0, hairline: -40, fringe: 'none', sideDrop: null, backDrop: null, tail: 'none', texture: 'straight' },
  { id: 'buzz', name: 'Buzz cut', top: 1.5, side: 1, hairline: -36, fringe: 'none', sideDrop: [-8, -8], backDrop: [4, 4], tail: 'none', texture: 'straight' },
  { id: 'sidepart', name: 'Side part', top: 8, side: 4, hairline: -26, fringe: 'swoop', sideDrop: [-4, 0], backDrop: [12, 20], tail: 'none', texture: 'straight' },
  { id: 'slick', name: 'Slicked back', top: 7, side: 3, hairline: -36, fringe: 'none', sideDrop: [-2, 10], backDrop: [14, 40], tail: 'none', texture: 'straight' },
  { id: 'messy', name: 'Messy', top: 13, side: 6, hairline: -22, fringe: 'messy', sideDrop: [-2, 16], backDrop: [14, 34], tail: 'none', texture: 'wavy' },
  { id: 'quiff', name: 'Quiff', top: 18, side: 3, hairline: -20, fringe: 'quiff', sideDrop: [-6, -2], backDrop: [8, 14], tail: 'none', texture: 'straight' },
  { id: 'undercut', name: 'Undercut', top: 14, side: 2, hairline: -24, fringe: 'swoop', sideDrop: null, backDrop: null, tail: 'none', texture: 'straight', shaved: 'sides' },
  { id: 'mohawk', name: 'Mohawk', top: 24, side: 0, hairline: -34, fringe: 'spiky', sideDrop: null, backDrop: null, tail: 'none', texture: 'straight', shaved: 'mohawk' },
  { id: 'afro', name: 'Afro', top: 26, side: 22, hairline: -30, fringe: 'none', sideDrop: [4, 24], backDrop: [10, 30], tail: 'none', texture: 'coily' },
  { id: 'curly', name: 'Curly', top: 14, side: 11, hairline: -26, fringe: 'messy', sideDrop: [14, 52], backDrop: [20, 56], tail: 'none', texture: 'curly' },
  { id: 'pixie', name: 'Pixie', top: 8, side: 3, hairline: -23, fringe: 'side', sideDrop: [4, 14], backDrop: [10, 16], tail: 'none', texture: 'straight' },
  { id: 'bob', name: 'Bob', top: 8, side: 6, hairline: -24, fringe: 'bangs', sideDrop: [26, 40], backDrop: [26, 40], tail: 'none', texture: 'straight' },
  { id: 'shoulder', name: 'Shoulder length', top: 7, side: 6, hairline: -26, fringe: 'curtain', sideDrop: [44, 82], backDrop: [44, 84], tail: 'none', texture: 'straight' },
  { id: 'long', name: 'Long', top: 6, side: 6, hairline: -27, fringe: 'curtain', sideDrop: [76, 170], backDrop: [78, 180], tail: 'none', texture: 'straight' },
  { id: 'wavy', name: 'Long and wavy', top: 8, side: 8, hairline: -26, fringe: 'curtain', sideDrop: [70, 150], backDrop: [72, 160], tail: 'none', texture: 'wavy' },
  { id: 'ponytail', name: 'Ponytail', top: 7, side: 3, hairline: -29, fringe: 'side', sideDrop: [-4, 0], backDrop: [8, 12], tail: 'pony', texture: 'straight' },
  { id: 'braid', name: 'Braid', top: 7, side: 3, hairline: -28, fringe: 'curtain', sideDrop: [-2, 2], backDrop: [10, 14], tail: 'braid', texture: 'straight' },
  { id: 'bun', name: 'Top bun', top: 6, side: 3, hairline: -30, fringe: 'side', sideDrop: [-4, 0], backDrop: [8, 10], tail: 'bun', texture: 'straight' },
  { id: 'pigtails', name: 'Pigtails', top: 7, side: 3, hairline: -26, fringe: 'bangs', sideDrop: [-4, 0], backDrop: [8, 10], tail: 'pigtails', texture: 'straight' },
]
