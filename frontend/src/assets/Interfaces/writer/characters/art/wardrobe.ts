import type { CharacterMarkKind } from '../../../../../api/types'
import type { Option } from './library'

// The body part of the library: builds, poses, clothes, accessories, things to hold, marks and the areas they go on. Sizes are in head units (a head is 100 high).

// ---- builds ---- half widths of the torso at the chest, waist and hips, the limbs' thickness, the width of the shoulders (all for the average = 1)
export interface BuildKind extends Option { chest: number; waist: number; hip: number; limb: number; shoulder: number }
export const BUILDS: readonly BuildKind[] = [
  { id: 'average', name: 'Average', chest: 44, waist: 37, hip: 44, limb: 1, shoulder: 1 },
  { id: 'slim', name: 'Slim', chest: 38, waist: 30, hip: 38, limb: 0.82, shoulder: 0.9 },
  { id: 'athletic', name: 'Athletic', chest: 52, waist: 38, hip: 44, limb: 1.12, shoulder: 1.12 },
  { id: 'curvy', name: 'Curvy', chest: 46, waist: 33, hip: 54, limb: 1, shoulder: 0.94 },
  { id: 'broad', name: 'Broad', chest: 58, waist: 50, hip: 52, limb: 1.2, shoulder: 1.2 },
  { id: 'heavy', name: 'Heavy', chest: 56, waist: 60, hip: 58, limb: 1.28, shoulder: 1.06 },
]

// ---- poses ---- a segment points by [ab, fw] degrees: ab away from the middle of the body (sideways; 90 is level, 180 straight up), fw towards the viewer (90 is straight at it)
export type Seg = [number, number]
// `sway` shifts the upper body sideways over the feet, `hipTilt` and `shoulderTilt` tip the line of the hips and of the shoulders (degrees, against each other: the weight
// is on the higher hip), so a stance is not a stiff column.
export interface PoseKind extends Option { lean: number; sway?: number; hipTilt?: number; shoulderTilt?: number; armL: [Seg, Seg]; armR: [Seg, Seg]; legL: [Seg, Seg]; legR: [Seg, Seg] }
export const POSES: readonly PoseKind[] = [
  { id: 'standing', name: 'Standing', lean: 0, sway: 5, hipTilt: -6, shoulderTilt: 4, armL: [[7, 6], [10, 26]], armR: [[10, -2], [16, 14]], legL: [[2, 0], [1, 0]], legR: [[10, 8], [7, -4]] },
  { id: 'relaxed', name: 'Hands on hips', lean: 0, sway: 4, hipTilt: -5, shoulderTilt: 4, armL: [[34, -8], [-42, 6]], armR: [[34, -8], [-42, 6]], legL: [[2, 0], [2, 0]], legR: [[11, 6], [9, -4]] },
  { id: 'walking', name: 'Walking', lean: 3, hipTilt: -3, shoulderTilt: 3, armL: [[5, -26], [5, -8]], armR: [[5, 22], [5, 50]], legL: [[2, 26], [2, 6]], legR: [[2, -22], [2, -44]] },
  { id: 'sitting', name: 'Sitting', lean: 0, armL: [[14, 18], [8, 72]], armR: [[14, 18], [8, 72]], legL: [[7, 86], [5, 2]], legR: [[7, 86], [5, 2]] },
  { id: 'running', name: 'Running', lean: 14, armL: [[10, 50], [8, 118]], armR: [[10, -45], [8, -10]], legL: [[2, 56], [2, 8]], legR: [[2, -30], [2, -96]] },
  { id: 'fighting', name: 'Fighting stance', lean: 6, armL: [[28, 35], [10, 118]], armR: [[22, 15], [-10, 102]], legL: [[22, 18], [14, -10]], legR: [[24, -14], [16, 10]] },
  { id: 'kneeling', name: 'Kneeling', lean: 2, armL: [[10, 10], [8, 52]], armR: [[8, 4], [4, 10]], legL: [[5, 80], [5, 4]], legR: [[5, 2], [5, -88]] },
  { id: 'raised', name: 'Arms raised', lean: 0, armL: [[165, 0], [172, 0]], armR: [[165, 0], [172, 0]], legL: [[3, 0], [2, 0]], legR: [[3, 0], [2, 0]] },
]

// ---- clothes ----
// `sleeve` how much of the arm is covered (0 none, 0.4 to the elbow, 1 to the wrist); `hem` how far down it hangs (1 is the hip, 2 is mid thigh); `neck` the neckline; `fit` its width;
// `skirt` a skirt from the hem down by that many units; `hood` a hood behind the neck.
export type Neck = 'round' | 'v' | 'collar' | 'high' | 'open'
export interface TopKind extends Option { sleeve: number; hem: number; neck: Neck; fit: number; skirt: number; hood: boolean; buttons: boolean }
export const TOPS: readonly TopKind[] = [
  { id: 'tee', name: 'T-shirt', sleeve: 0.4, hem: 1.08, neck: 'round', fit: 1.04, skirt: 0, hood: false, buttons: false },
  { id: 'tank', name: 'Tank top', sleeve: 0, hem: 1.05, neck: 'round', fit: 1, skirt: 0, hood: false, buttons: false },
  { id: 'longsleeve', name: 'Long sleeves', sleeve: 1, hem: 1.08, neck: 'round', fit: 1.04, skirt: 0, hood: false, buttons: false },
  { id: 'shirt', name: 'Shirt', sleeve: 1, hem: 1.14, neck: 'collar', fit: 1.08, skirt: 0, hood: false, buttons: true },
  { id: 'tunic', name: 'Tunic', sleeve: 0.65, hem: 1.5, neck: 'v', fit: 1.12, skirt: 0, hood: false, buttons: false },
  { id: 'hoodie', name: 'Hoodie', sleeve: 1, hem: 1.16, neck: 'high', fit: 1.14, skirt: 0, hood: true, buttons: false },
  { id: 'dress', name: 'Dress', sleeve: 0.3, hem: 1.1, neck: 'v', fit: 1.02, skirt: 260, hood: false, buttons: false },
  { id: 'gown', name: 'Gown', sleeve: 0.9, hem: 1.1, neck: 'round', fit: 1.05, skirt: 470, hood: false, buttons: false },
]
// `leg` how much of the leg it covers (1 to the ankle); a skirt hangs by `skirt` units from the hip; `tight` follows the leg.
export interface BottomKind extends Option { leg: number; skirt: number; tight: boolean }
export const BOTTOMS: readonly BottomKind[] = [
  { id: 'trousers', name: 'Trousers', leg: 1, skirt: 0, tight: false },
  { id: 'shorts', name: 'Shorts', leg: 0.42, skirt: 0, tight: false },
  { id: 'leggings', name: 'Leggings', leg: 1, skirt: 0, tight: true },
  { id: 'breeches', name: 'Breeches', leg: 0.78, skirt: 0, tight: false },
  { id: 'skirt', name: 'Skirt', leg: 0, skirt: 190, tight: false },
  { id: 'longskirt', name: 'Long skirt', leg: 0, skirt: 360, tight: false },
]
// `shaft` how far up the shin it reaches (0 a shoe), `open` straps over a bare foot.
export interface ShoeKind extends Option { shaft: number; open: boolean }
export const SHOES: readonly ShoeKind[] = [
  { id: 'shoes', name: 'Shoes', shaft: 0, open: false },
  { id: 'boots', name: 'Boots', shaft: 0.38, open: false },
  { id: 'tallboots', name: 'Tall boots', shaft: 0.78, open: false },
  { id: 'sandals', name: 'Sandals', shaft: 0, open: true },
]
export type OuterShape = 'jacket' | 'coat' | 'vest' | 'cape' | 'cloak' | 'armor'
export interface OuterKind extends Option { shape: OuterShape; sleeve: number; hem: number }
export const OUTER: readonly OuterKind[] = [
  { id: 'jacket', name: 'Jacket', shape: 'jacket', sleeve: 1, hem: 1.12 },
  { id: 'coat', name: 'Long coat', shape: 'coat', sleeve: 1, hem: 2.1 },
  { id: 'vest', name: 'Vest', shape: 'vest', sleeve: 0, hem: 1.1 },
  { id: 'cape', name: 'Cape', shape: 'cape', sleeve: 0, hem: 2.1 },
  { id: 'cloak', name: 'Hooded cloak', shape: 'cloak', sleeve: 0, hem: 2.6 },
  { id: 'breastplate', name: 'Breastplate', shape: 'armor', sleeve: 0, hem: 0.95 },
]
export type AccessorySlot = 'head' | 'face' | 'neck' | 'waist' | 'hands' | 'bag' | 'ears'
export interface AccessoryKind extends Option { slot: AccessorySlot }
export const ACCESSORIES: readonly AccessoryKind[] = [
  { id: 'hat', name: 'Brimmed hat', slot: 'head' },
  { id: 'cap', name: 'Cap', slot: 'head' },
  { id: 'crown', name: 'Crown', slot: 'head' },
  { id: 'hood', name: 'Hood', slot: 'head' },
  { id: 'headband', name: 'Headband', slot: 'head' },
  { id: 'glasses', name: 'Glasses', slot: 'face' },
  { id: 'eyepatch', name: 'Eye patch', slot: 'face' },
  { id: 'scarf', name: 'Scarf', slot: 'neck' },
  { id: 'necklace', name: 'Necklace', slot: 'neck' },
  { id: 'earrings', name: 'Earrings', slot: 'ears' },
  { id: 'belt', name: 'Belt', slot: 'waist' },
  { id: 'gloves', name: 'Gloves', slot: 'hands' },
  { id: 'satchel', name: 'Satchel', slot: 'bag' },
  { id: 'backpack', name: 'Backpack', slot: 'bag' },
]
export const OUTFIT_SLOTS = ['top', 'bottom', 'shoes', 'outer'] as const
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number]
export const SLOT_NAMES: Record<OutfitSlot | 'accessory', string> = { top: 'Top', bottom: 'Bottom', shoes: 'Footwear', outer: 'Outerwear', accessory: 'Accessories' }

// ---- things to hold ---- (`len` how long it is, drawn upright from the hand)
export interface ItemKind extends Option { len: number }
export const ITEMS: readonly ItemKind[] = [
  { id: 'sword', name: 'Sword', len: 170 },
  { id: 'staff', name: 'Staff', len: 330 },
  { id: 'torch', name: 'Torch', len: 120 },
  { id: 'book', name: 'Book', len: 46 },
  { id: 'cup', name: 'Cup', len: 30 },
  { id: 'lantern', name: 'Lantern', len: 64 },
]

// ---- marks ----
export const MARK_KINDS: Array<{ id: CharacterMarkKind; name: string }> = [
  { id: 'freckles', name: 'Freckles' }, { id: 'mole', name: 'Mole' }, { id: 'scar', name: 'Scar' }, { id: 'birthmark', name: 'Birthmark' },
  { id: 'tattoo', name: 'Tattoo' }, { id: 'blush', name: 'Blush' }, { id: 'makeup', name: 'Make-up' }, { id: 'paint', name: 'Face paint' },
]
// The designs of each kind of mark. A tattoo or a scar design is a line drawing in a 100 by 100 box; the others are drawn by the code.
export interface DesignKind extends Option { d?: string }
export const DESIGNS: Record<CharacterMarkKind, readonly DesignKind[]> = {
  freckles: [{ id: 'light', name: 'Light' }, { id: 'dense', name: 'Dense' }, { id: 'nose', name: 'Across the nose' }],
  mole: [{ id: 'small', name: 'Small' }, { id: 'round', name: 'Round' }, { id: 'large', name: 'Large' }],
  scar: [
    { id: 'slash', name: 'Slash', d: 'M16 8 L84 92 M30 28 l-9 6 M44 45 l-9 6 M58 62 l-9 6 M72 79 l-9 6' },
    { id: 'cross', name: 'Cross', d: 'M20 20 L80 80 M80 20 L20 80' },
    { id: 'claw', name: 'Claw marks', d: 'M22 6 Q34 50 26 94 M48 4 Q60 50 52 96 M74 6 Q86 50 78 94' },
    { id: 'burn', name: 'Burn', d: 'M30 20 Q60 6 78 28 Q92 52 70 78 Q44 96 24 72 Q8 48 30 20 Z M42 36 Q58 30 64 46 Q68 62 52 68' },
  ],
  birthmark: [{ id: 'patch', name: 'Patch' }, { id: 'splash', name: 'Splash' }, { id: 'strawberry', name: 'Strawberry' }],
  tattoo: [
    { id: 'band', name: 'Band', d: 'M4 38 H96 M4 62 H96 M4 50 Q20 40 36 50 T68 50 T96 50' },
    { id: 'star', name: 'Star', d: 'M50 8 L61 38 L93 40 L68 60 L77 92 L50 74 L23 92 L32 60 L7 40 L39 38 Z' },
    { id: 'moon', name: 'Moon', d: 'M60 10 A40 40 0 1 0 90 62 A32 32 0 1 1 60 10 Z' },
    { id: 'anchor', name: 'Anchor', d: 'M50 14 V84 M32 30 H68 M16 62 Q22 90 50 90 Q78 90 84 62 M10 70 L16 62 L24 72 M76 72 L84 62 L90 70 M50 8 a5 5 0 1 0 0.01 0' },
    { id: 'rose', name: 'Rose', d: 'M50 44 m-4 0 a4 4 0 1 1 8 0 a8 8 0 1 1 -16 0 a14 14 0 1 1 28 0 a20 20 0 1 1 -40 0 M50 66 Q46 86 36 96 M48 80 Q36 74 30 82' },
    { id: 'snake', name: 'Snake', d: 'M20 92 Q4 70 30 62 Q60 52 46 38 Q30 24 56 14 Q76 8 82 22 M82 22 l7 -4 M82 22 l7 5' },
    { id: 'tribal', name: 'Tribal', d: 'M8 50 L30 18 L40 50 L50 12 L60 50 L70 18 L92 50 L70 82 L60 50 L50 88 L40 50 L30 82 Z' },
    { id: 'dagger', name: 'Dagger', d: 'M50 4 L59 58 L50 68 L41 58 Z M28 68 H72 M50 68 V96' },
    { id: 'wings', name: 'Wings', d: 'M50 50 Q30 8 4 18 Q14 38 8 50 Q22 52 14 66 Q30 62 50 72 M50 50 Q70 8 96 18 Q86 38 92 50 Q78 52 86 66 Q70 62 50 72' },
    { id: 'swirl', name: 'Swirl', d: 'M50 50 c10 -20 40 -10 35 15 c-5 25 -40 30 -55 5 c-15 -25 5 -55 35 -50' },
    { id: 'cross', name: 'Cross', d: 'M50 6 V94 M20 32 H80' },
  ],
  blush: [{ id: 'round', name: 'Round' }, { id: 'soft', name: 'Soft' }, { id: 'nose', name: 'Nose and cheeks' }],
  makeup: [{ id: 'eyeshadow', name: 'Eye shadow' }, { id: 'eyeliner', name: 'Eyeliner' }, { id: 'lipstick', name: 'Lipstick' }, { id: 'contour', name: 'Contour' }],
  paint: [{ id: 'stripes', name: 'Stripes' }, { id: 'band', name: 'Band across the eyes' }, { id: 'half', name: 'Half face' }, { id: 'star', name: 'Star on the cheek' }],
}
export const DEFAULT_MARK_COLORS: Record<CharacterMarkKind, string> = {
  freckles: '#a8683f', mole: '#5a3a28', scar: '#b86a6a', birthmark: '#a65f4a', tattoo: '#2f3b52', blush: '#e6847a', makeup: '#6a4a8a', paint: '#b3322e',
}

// Where a mark can go. A head area is a rectangle of the head in head units; a body area is a stretch of a limb or the torso (see body.tsx), in the order along it.
export type AreaZone = 'head' | 'torso' | 'limb'
export interface AreaKind extends Option { zone: AreaZone; rect?: [number, number, number, number]; marks: readonly CharacterMarkKind[] }
const ALL: readonly CharacterMarkKind[] = ['freckles', 'mole', 'scar', 'birthmark', 'tattoo', 'blush', 'makeup', 'paint']
const BODY: readonly CharacterMarkKind[] = ['mole', 'scar', 'birthmark', 'tattoo']
export const AREAS: readonly AreaKind[] = [
  { id: 'cheeks', name: 'Cheeks', zone: 'head', rect: [-32, -4, 32, 20], marks: ALL },
  { id: 'forehead', name: 'Forehead', zone: 'head', rect: [-26, -40, 26, -22], marks: ['mole', 'scar', 'birthmark', 'tattoo', 'paint', 'freckles'] },
  { id: 'eyes', name: 'Around the eyes', zone: 'head', rect: [-30, -16, 30, 4], marks: ['freckles', 'scar', 'makeup', 'paint', 'tattoo'] },
  { id: 'nose', name: 'Nose', zone: 'head', rect: [-9, -8, 9, 16], marks: ['freckles', 'mole', 'scar', 'blush'] },
  { id: 'lips', name: 'Lips and chin', zone: 'head', rect: [-16, 20, 16, 46], marks: ['mole', 'scar', 'birthmark', 'makeup', 'tattoo'] },
  { id: 'neck', name: 'Neck', zone: 'limb', marks: BODY },
  { id: 'chest', name: 'Chest', zone: 'torso', marks: BODY },
  { id: 'belly', name: 'Belly', zone: 'torso', marks: BODY },
  { id: 'back', name: 'Back', zone: 'torso', marks: BODY },
  { id: 'upperArmL', name: 'Left upper arm', zone: 'limb', marks: BODY },
  { id: 'foreArmL', name: 'Left forearm', zone: 'limb', marks: BODY },
  { id: 'upperArmR', name: 'Right upper arm', zone: 'limb', marks: BODY },
  { id: 'foreArmR', name: 'Right forearm', zone: 'limb', marks: BODY },
  { id: 'thighL', name: 'Left thigh', zone: 'limb', marks: BODY },
  { id: 'shinL', name: 'Left shin', zone: 'limb', marks: BODY },
  { id: 'thighR', name: 'Right thigh', zone: 'limb', marks: BODY },
  { id: 'shinR', name: 'Right shin', zone: 'limb', marks: BODY },
]
export const areaOf = (id: string): AreaKind => AREAS.find(a => a.id === id) ?? AREAS[0]
