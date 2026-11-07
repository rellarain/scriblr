// The portrait library: every choice the portrait is made from, each with the numbers it is drawn from. An id names an entry; `pick` gives the entry for an id, and a
// default one for an id this build does not know (a portrait from a newer build still draws).

export interface Option { id: string; name: string }

// Look up an entry; an unknown id gives the entry `fallback` names (the first entry when none is named).
export function pick<T extends Option>(list: readonly T[], id: string, fallback?: string): T {
  return list.find(o => o.id === id) ?? list.find(o => o.id === fallback) ?? list[0]
}

// Age: head height H, width over height, where the eyes sit (a fraction of H from the crown), the distances to the brow, the base of the nose and the mouth, the hairline,
// the scales of the features, the length of the neck, the width of the shoulders, how many lines the face has (0 to 3), and where the chin is.
export interface Age extends Option { H: number; wr: number; eye: number; brow: number; nose: number; mouth: number; hair: number; eyeS: number; noseS: number; mouthS: number; neckLen: number; shoulder: number; neckW: number; lines: number; chin: number }
export interface Build extends Option { neck: number; shoulder: number; neckLen: number; face: number; trap: number; jowl?: number }
// A head shape: overall width, forehead, cheekbones, jaw width and height (a fraction of H), the width of the chin, a sharper corner of the jaw.
export interface Head extends Option { w: number; long?: number; fore: number; cheek: number; jaw: number; jawY: number; chin: number; sharp?: boolean }
export interface Ear extends Option { h: number; w: number; lobe: number; topW?: number }
// An eye: width, how open, the lower lid, the peak of the upper lid (towards the outer corner above 1), a built-in tilt, the size of the iris, the crease (0 none, 1 clear),
// and the hood, the heavy lid and the deep set.
export interface Eye extends Option { w: number; open: number; bot: number; peak: number; tilt: number; iris: number; crease: number; hood?: number; deep?: number; lid?: number; flick?: number }
// A brow: how high it arches, where it peaks (0 to 1), the thickness at the inner end, the taper, how far the tail drops, the length, and the kinds of brow.
export interface Brow extends Option { arch: number; peak: number; th: number; taper: number; tail: number; len: number; angle?: number; rough?: number; s?: number; low?: number; sparse?: boolean; none?: boolean }
// A nose: the width of the tip, of the wings, of the bridge, the length, and a hooked bridge, an upturned tip, a round tip, a drooping tip, a flat one, a bent one.
export interface Nose extends Option { tip: number; wing: number; bridge: number; len: number; hook?: number; up?: number; round?: number; droop?: number; flat?: number; bent?: number }
// A mouth: half width, the upper and the lower lip, the dip of the bow, the corners at rest.
export interface Mouth extends Option { w: number; up: number; lo: number; bow: number; rest: number; uneven?: number }
// An expression: how open the lids are, the lower lid raised, the inner and outer ends of the brows (down is more), the smile, the mouth open, the teeth shown, and more.
export interface Expression extends Option { lid: number; bot: number; bin: number; bout: number; smile: number; open: number; teeth: number; wide?: number; asym?: number; browRaise?: number; narrow?: number; round?: number; look?: number }
// A top: how far its neckline opens from the neck (open) and how deep it goes (depth), a band along the neckline, a V, a roll at the neck (turtle, or a mock one), or a shape of its own
// (square, heart, cowl, henley, polo, off the shoulder, strapless).
export interface Top extends Option { open: number; depth: number; band?: number; v?: boolean; turtle?: boolean; mock?: boolean; shape?: 'square' | 'heart' | 'cowl' | 'henley' | 'polo' | 'off' | 'strapless' }
// Hair: a length (L is how far it falls from the crown when stretched, in head heights; i is its place in the list), a texture, a style, a front, a hairline.
export interface Length extends Option { L: number; i: number }
export interface Texture extends Option { kind: 'straight' | 'wavy' | 'curly' | 'coily'; vol: number; shrink: number; amp?: number; sp?: number; zig?: boolean }
export interface Style extends Option { min: number; max: number; fronts?: string[] }
export interface Front extends Option { min?: number }
export interface HairlineHeight extends Option { dy: number }
export interface Grey extends Option { amount?: number }

// Age: head height H, width/height, where the eyes sit (fraction of H from the crown), the distances to the brow, nose base and mouth,
// the hairline, feature scales, neck length, shoulder width factor, lines (0-3).
export const AGES: Age[] = [
  { id: 'infant', name: 'Infant', H: 100, wr: 0.86, eye: 0.6, brow: 0.1, nose: 0.13, mouth: 0.215, hair: 0.3, eyeS: 1.32, noseS: 0.5, mouthS: 0.62, neckLen: 6, shoulder: 0.6, neckW: 0.95, lines: 0, chin: 130 },
  { id: 'toddler', name: 'Toddler', H: 98, wr: 0.83, eye: 0.58, brow: 0.095, nose: 0.15, mouth: 0.235, hair: 0.27, eyeS: 1.24, noseS: 0.58, mouthS: 0.7, neckLen: 10, shoulder: 0.66, neckW: 0.92, lines: 0, chin: 128 },
  { id: 'child', name: 'Child', H: 95, wr: 0.79, eye: 0.555, brow: 0.085, nose: 0.17, mouth: 0.26, hair: 0.22, eyeS: 1.12, noseS: 0.72, mouthS: 0.8, neckLen: 15, shoulder: 0.74, neckW: 0.9, lines: 0, chin: 126 },
  { id: 'teen', name: 'Teen', H: 93, wr: 0.745, eye: 0.52, brow: 0.074, nose: 0.2, mouth: 0.29, hair: 0.18, eyeS: 1.03, noseS: 0.92, mouthS: 0.94, neckLen: 22, shoulder: 0.9, neckW: 0.95, lines: 0, chin: 124 },
  { id: 'young', name: 'Young adult', H: 92, wr: 0.725, eye: 0.505, brow: 0.075, nose: 0.212, mouth: 0.302, hair: 0.17, eyeS: 1.01, noseS: 0.98, mouthS: 1, neckLen: 25, shoulder: 0.98, neckW: 1, lines: 0, chin: 123 },
  { id: 'adult', name: 'Adult (30s)', H: 92, wr: 0.72, eye: 0.5, brow: 0.075, nose: 0.215, mouth: 0.305, hair: 0.17, eyeS: 1, noseS: 1, mouthS: 1, neckLen: 26, shoulder: 1, neckW: 1, lines: 0.15, chin: 123 },
  { id: 'middle', name: 'Middle-aged', H: 92, wr: 0.725, eye: 0.5, brow: 0.075, nose: 0.218, mouth: 0.31, hair: 0.17, eyeS: 0.98, noseS: 1.02, mouthS: 1, neckLen: 25, shoulder: 1, neckW: 1.03, lines: 0.6, chin: 123 },
  { id: 'older', name: 'Older (60s)', H: 92, wr: 0.73, eye: 0.5, brow: 0.078, nose: 0.222, mouth: 0.315, hair: 0.17, eyeS: 0.95, noseS: 1.05, mouthS: 0.98, neckLen: 24, shoulder: 0.99, neckW: 1.05, lines: 1.2, chin: 124 },
  { id: 'elderly', name: 'Elderly', H: 91, wr: 0.735, eye: 0.5, brow: 0.08, nose: 0.226, mouth: 0.32, hair: 0.17, eyeS: 0.92, noseS: 1.08, mouthS: 0.95, neckLen: 23, shoulder: 0.96, neckW: 1.05, lines: 2, chin: 125 },
];
export const BUILDS: Build[] = [
  { id: 'average', name: 'Average', neck: 0.5, shoulder: 86, neckLen: 1, face: 1, trap: 0.35 },
  { id: 'slight', name: 'Slight', neck: 0.44, shoulder: 76, neckLen: 1.08, face: 0.98, trap: 0.3 },
  { id: 'broad', name: 'Broad', neck: 0.6, shoulder: 96, neckLen: 0.9, face: 1.02, trap: 0.42 },
  { id: 'heavy', name: 'Heavy', neck: 0.66, shoulder: 98, neckLen: 0.72, face: 1.06, trap: 0.5, jowl: 1 },
];
export const CHESTS: Option[] = [{ id: 'average', name: 'Average' }, { id: 'flat', name: 'Flat' }, { id: 'full', name: 'Full' }];
// Head shapes: overall width, forehead, cheekbones, jaw width and height (fraction of H), chin width, a sharper jaw corner.
export const HEADS: Head[] = [
  { id: 'oval', name: 'Oval', w: 1, fore: 0.93, cheek: 1, jaw: 0.78, jawY: 0.8, chin: 0.3 },
  { id: 'round', name: 'Round', w: 1.05, fore: 0.95, cheek: 1.02, jaw: 0.88, jawY: 0.77, chin: 0.44 },
  { id: 'square', name: 'Square', w: 1.02, fore: 0.96, cheek: 1, jaw: 0.94, jawY: 0.84, chin: 0.48, sharp: true },
  { id: 'oblong', name: 'Oblong', w: 0.95, long: 1.07, fore: 0.93, cheek: 0.98, jaw: 0.86, jawY: 0.84, chin: 0.38 },
  { id: 'heart', name: 'Heart', w: 1, fore: 1, cheek: 1, jaw: 0.7, jawY: 0.79, chin: 0.2 },
  { id: 'diamond', name: 'Diamond', w: 1, fore: 0.82, cheek: 1.05, jaw: 0.72, jawY: 0.8, chin: 0.25 },
  { id: 'triangle', name: 'Triangle', w: 1, fore: 0.82, cheek: 0.97, jaw: 0.96, jawY: 0.82, chin: 0.42 },
  { id: 'rectangle', name: 'Rectangle', w: 0.98, long: 1.05, fore: 0.95, cheek: 0.98, jaw: 0.95, jawY: 0.86, chin: 0.48, sharp: true },
  { id: 'softsquare', name: 'Soft square', w: 1.02, fore: 0.95, cheek: 1, jaw: 0.9, jawY: 0.82, chin: 0.42 },
  { id: 'angular', name: 'Angular', w: 1, fore: 0.9, cheek: 1.06, jaw: 0.8, jawY: 0.84, chin: 0.3, sharp: true },
  { id: 'narrow', name: 'Narrow', w: 0.91, long: 1.03, fore: 0.94, cheek: 1, jaw: 0.8, jawY: 0.81, chin: 0.32 },
  { id: 'wide', name: 'Wide', w: 1.1, fore: 0.95, cheek: 1, jaw: 0.86, jawY: 0.79, chin: 0.38 },
  { id: 'pointed', name: 'Pointed chin', w: 0.98, fore: 0.94, cheek: 1, jaw: 0.72, jawY: 0.78, chin: 0.14 },
];
export const EARS: Ear[] = [
  { id: 'average', name: 'Average', h: 1, w: 1, lobe: 1 },
  { id: 'small', name: 'Small', h: 0.86, w: 0.85, lobe: 0.8 },
  { id: 'large', name: 'Large', h: 1.15, w: 1.15, lobe: 1.1 },
  { id: 'round', name: 'Round', h: 0.92, w: 1.12, lobe: 1 },
  { id: 'narrow', name: 'Narrow', h: 1.05, w: 0.78, lobe: 0.9 },
  { id: 'protruding', name: 'Sticking out', h: 1.02, w: 1.4, lobe: 1 },
  { id: 'flat', name: 'Close to the head', h: 0.98, w: 0.6, lobe: 0.9 },
  { id: 'longlobe', name: 'Long lobes', h: 1.12, w: 1, lobe: 1.6 },
  { id: 'attached', name: 'Attached lobes', h: 0.95, w: 0.95, lobe: 0.45 },
  { id: 'wide', name: 'Wide at the top', h: 1, w: 1.25, lobe: 0.8, topW: 1.2 },
  { id: 'tall', name: 'Tall', h: 1.25, w: 0.95, lobe: 1 },
  { id: 'tiny', name: 'Tiny', h: 0.72, w: 0.75, lobe: 0.7 },
];
// Eyes: width, how open, the lower lid, the peak of the upper lid (toward the outer corner when > 1), a built-in tilt, iris size,
// crease (0 none, 1 visible), hood (the lid fold covering the crease), deep-set shadow.
export const EYES: Eye[] = [
  { id: 'almond', name: 'Almond', w: 1, open: 1, bot: 1, peak: 1.15, tilt: 2, iris: 1, crease: 1 },
  { id: 'round', name: 'Round', w: 0.96, open: 1.28, bot: 1.25, peak: 1, tilt: 0, iris: 1, crease: 1 },
  { id: 'hooded', name: 'Hooded', w: 1, open: 0.86, bot: 1, peak: 1.2, tilt: 0, iris: 1, crease: 0.4, hood: 1 },
  { id: 'monolid', name: 'Monolid', w: 1.02, open: 0.74, bot: 0.8, peak: 1.05, tilt: 4, iris: 0.95, crease: 0 },
  { id: 'downturned', name: 'Downturned', w: 1, open: 1, bot: 1, peak: 0.85, tilt: -6, iris: 1, crease: 1 },
  { id: 'upturned', name: 'Upturned', w: 1, open: 0.95, bot: 0.9, peak: 1.25, tilt: 7, iris: 1, crease: 1 },
  { id: 'deepset', name: 'Deep-set', w: 0.95, open: 0.9, bot: 0.95, peak: 1.1, tilt: 1, iris: 1, crease: 0.6, deep: 1 },
  { id: 'large', name: 'Large', w: 1.12, open: 1.2, bot: 1.15, peak: 1.05, tilt: 1, iris: 1.05, crease: 1 },
  { id: 'narrow', name: 'Narrow', w: 1.02, open: 0.66, bot: 0.75, peak: 1.1, tilt: 2, iris: 0.95, crease: 0.7 },
  { id: 'wide', name: 'Wide-set almond', w: 1.08, open: 0.9, bot: 0.9, peak: 1.2, tilt: 3, iris: 0.95, crease: 1 },
  { id: 'heavy', name: 'Heavy-lidded', w: 1, open: 0.72, bot: 0.95, peak: 1.1, tilt: -1, iris: 1.05, crease: 0.8, lid: 1 },
  { id: 'doe', name: 'Doe', w: 1.06, open: 1.18, bot: 1.3, peak: 0.95, tilt: -2, iris: 1.12, crease: 1 },
  { id: 'cat', name: 'Cat-eye', w: 1.04, open: 0.86, bot: 0.8, peak: 1.35, tilt: 9, iris: 0.95, crease: 1, flick: 1 },
  { id: 'small', name: 'Small', w: 0.84, open: 0.92, bot: 0.95, peak: 1.1, tilt: 1, iris: 1, crease: 0.7 },
];
// Brows: arch height, where it peaks (0..1), angled peak, inner thickness, taper, the tail drop, length, sparse.
export const BROWS: Brow[] = [
  { id: 'soft', name: 'Soft arch', arch: 2.2, peak: 0.62, th: 2.3, taper: 0.6, tail: 1.2, len: 1 },
  { id: 'straight', name: 'Straight', arch: 0.4, peak: 0.6, th: 2.4, taper: 0.45, tail: 0.6, len: 1 },
  { id: 'high', name: 'High arch', arch: 3.6, peak: 0.6, th: 2, taper: 0.65, tail: 2.2, len: 1, angle: 0.5 },
  { id: 'angled', name: 'Angled', arch: 3, peak: 0.66, th: 2.3, taper: 0.62, tail: 2.6, len: 1, angle: 1 },
  { id: 'rounded', name: 'Rounded', arch: 2.6, peak: 0.5, th: 2.2, taper: 0.5, tail: 2, len: 0.96 },
  { id: 'thick', name: 'Thick straight', arch: 0.8, peak: 0.6, th: 3.6, taper: 0.35, tail: 0.8, len: 1.02 },
  { id: 'thickarch', name: 'Thick arched', arch: 2.4, peak: 0.6, th: 3.3, taper: 0.45, tail: 1.6, len: 1.02 },
  { id: 'thin', name: 'Thin', arch: 2.4, peak: 0.6, th: 1.2, taper: 0.55, tail: 1.6, len: 0.98 },
  { id: 'bushy', name: 'Bushy', arch: 1.2, peak: 0.55, th: 3.8, taper: 0.25, tail: 1.2, len: 1.06, rough: 1 },
  { id: 'sshape', name: 'S-shaped', arch: 2.4, peak: 0.55, th: 2.3, taper: 0.6, tail: 1.6, len: 1, s: 1 },
  { id: 'low', name: 'Low and flat', arch: 0.2, peak: 0.6, th: 2.6, taper: 0.45, tail: 0.2, len: 1, low: 2.2 },
  { id: 'sparse', name: 'Sparse', arch: 1.8, peak: 0.6, th: 1.8, taper: 0.6, tail: 1.4, len: 0.92, sparse: true },
  { id: 'none', name: 'None', arch: 0, peak: 0.6, th: 0, taper: 0, tail: 0, len: 1, none: true },
];
// Noses: tip width, wing (nostril) width, bridge width, length, hooked bridge, upturned tip, the tip's roundness.
export const NOSES: Nose[] = [
  { id: 'straight', name: 'Straight', tip: 1, wing: 1, bridge: 1, len: 1 },
  { id: 'button', name: 'Button', tip: 1.1, wing: 0.86, bridge: 0.7, len: 0.86, up: 1, round: 1 },
  { id: 'roman', name: 'Roman', tip: 0.95, wing: 1, bridge: 1.15, len: 1.06, hook: 1 },
  { id: 'hooked', name: 'Hooked', tip: 0.9, wing: 0.95, bridge: 1.1, len: 1.1, hook: 1.6, droop: 1 },
  { id: 'snub', name: 'Snub', tip: 1.05, wing: 0.95, bridge: 0.75, len: 0.84, up: 1.8 },
  { id: 'broad', name: 'Broad', tip: 1.3, wing: 1.32, bridge: 1.2, len: 1 },
  { id: 'wide', name: 'Wide and flat', tip: 1.35, wing: 1.45, bridge: 1.05, len: 0.92, flat: 1 },
  { id: 'narrow', name: 'Narrow', tip: 0.8, wing: 0.8, bridge: 0.85, len: 1.04 },
  { id: 'long', name: 'Long', tip: 0.95, wing: 0.95, bridge: 0.95, len: 1.14 },
  { id: 'bulbous', name: 'Bulbous', tip: 1.45, wing: 1.1, bridge: 0.95, len: 1.02, round: 1.5 },
  { id: 'pointed', name: 'Pointed', tip: 0.72, wing: 0.9, bridge: 0.9, len: 1.05, droop: 0.6 },
  { id: 'aquiline', name: 'Aquiline', tip: 0.85, wing: 0.92, bridge: 1, len: 1.08, hook: 1.2, droop: 0.8 },
  { id: 'small', name: 'Small', tip: 0.85, wing: 0.82, bridge: 0.75, len: 0.88 },
  { id: 'crooked', name: 'Crooked', tip: 1, wing: 1, bridge: 1.05, len: 1.02, bent: 1 },
];
// Mouths: half width, upper lip, lower lip, the bow (dip of the upper lip), corners at rest.
export const MOUTHS: Mouth[] = [
  { id: 'medium', name: 'Medium', w: 1, up: 1, lo: 1, bow: 1, rest: 0 },
  { id: 'full', name: 'Full', w: 1.02, up: 1.35, lo: 1.4, bow: 1, rest: 0 },
  { id: 'thin', name: 'Thin', w: 1, up: 0.55, lo: 0.65, bow: 0.6, rest: 0 },
  { id: 'wide', name: 'Wide', w: 1.18, up: 0.95, lo: 1, bow: 0.9, rest: 0 },
  { id: 'small', name: 'Small', w: 0.82, up: 1, lo: 1.05, bow: 1, rest: 0 },
  { id: 'heart', name: 'Heart', w: 0.92, up: 1.35, lo: 1.05, bow: 1.5, rest: 0 },
  { id: 'bow', name: 'Cupid’s bow', w: 0.98, up: 1.15, lo: 1.1, bow: 1.8, rest: 0 },
  { id: 'downturned', name: 'Downturned', w: 1, up: 0.95, lo: 1, bow: 1, rest: -1.2 },
  { id: 'upturned', name: 'Upturned', w: 1, up: 1, lo: 1, bow: 1, rest: 0.9 },
  { id: 'fullower', name: 'Full lower lip', w: 1, up: 0.8, lo: 1.5, bow: 0.9, rest: 0 },
  { id: 'wideFull', name: 'Wide and full', w: 1.16, up: 1.3, lo: 1.35, bow: 1, rest: 0 },
  { id: 'round', name: 'Round', w: 0.86, up: 1.2, lo: 1.25, bow: 0.7, rest: 0 },
  { id: 'uneven', name: 'Uneven', w: 1, up: 1, lo: 1, bow: 1, rest: 0, uneven: 1 },
];
// Expressions: lid (how open), bot (lower lid raised), brows inner/outer (+ down), smile (corners up), open mouth, teeth, look sideways, asymmetry.
export const EXPRESSIONS: Expression[] = [
  { id: 'neutral', name: 'Neutral', lid: 1, bot: 0, bin: 0, bout: 0, smile: 0, open: 0, teeth: 0 },
  { id: 'soft', name: 'Soft smile', lid: 0.96, bot: 0.15, bin: 0, bout: 0, smile: 0.45, open: 0, teeth: 0 },
  { id: 'smile', name: 'Smile', lid: 0.92, bot: 0.3, bin: 0, bout: 0, smile: 0.85, open: 0.3, teeth: 1 },
  { id: 'grin', name: 'Grin', lid: 0.86, bot: 0.4, bin: 0, bout: -0.5, smile: 1.05, open: 0.45, teeth: 1, wide: 1 },
  { id: 'laugh', name: 'Laugh', lid: 0.55, bot: 0.55, bin: -0.6, bout: -1, smile: 1.1, open: 0.95, teeth: 1, wide: 1 },
  { id: 'smirk', name: 'Smirk', lid: 0.94, bot: 0.12, bin: 0, bout: 0, smile: 0.2, open: 0, teeth: 0, asym: 0.75, browRaise: -1.4 },
  { id: 'stern', name: 'Stern', lid: 0.9, bot: 0.05, bin: 1.6, bout: 0, smile: -0.2, open: 0, teeth: 0 },
  { id: 'angry', name: 'Angry', lid: 0.86, bot: 0.15, bin: 3.4, bout: -1.4, smile: -0.5, open: 0.12, teeth: 1, narrow: 1 },
  { id: 'sad', name: 'Sad', lid: 0.84, bot: 0, bin: -3.2, bout: 1.4, smile: -0.75, open: 0, teeth: 0 },
  { id: 'worried', name: 'Worried', lid: 1.08, bot: 0, bin: -3, bout: 0.6, smile: -0.3, open: 0, teeth: 0 },
  { id: 'surprised', name: 'Surprised', lid: 1.3, bot: 0, bin: -3.6, bout: -3, smile: 0, open: 0.85, teeth: 0.4, round: 1 },
  { id: 'sleepy', name: 'Sleepy', lid: 0.42, bot: 0.05, bin: 0.4, bout: 0.8, smile: 0.05, open: 0, teeth: 0 },
  { id: 'thoughtful', name: 'Thoughtful', lid: 0.92, bot: 0.05, bin: 0, bout: 0, smile: -0.05, open: 0, teeth: 0, look: -0.45, browRaise: -2.2 },
];
export const TOPS: Top[] = [
  { id: 'crew', name: 'Crew neck', open: 3, depth: 6, band: 1 },
  { id: 'vneck', name: 'V-neck', open: 5, depth: 25, v: true, band: 1 },
  { id: 'deepv', name: 'Deep V', open: 5, depth: 42, v: true, band: 1 },
  { id: 'scoop', name: 'Scoop neck', open: 9, depth: 19, band: 1 },
  { id: 'widescoop', name: 'Wide scoop', open: 16, depth: 24, band: 1 },
  { id: 'boat', name: 'Boat neck', open: 22, depth: 5, band: 0 },
  { id: 'square', name: 'Square neck', open: 15, depth: 17, band: 1, shape: 'square' },
  { id: 'sweetheart', name: 'Sweetheart', open: 20, depth: 38, band: 1, shape: 'heart' },
  { id: 'henley', name: 'Henley', open: 3, depth: 6, band: 1, shape: 'henley' },
  { id: 'polo', name: 'Polo collar', open: 6, depth: 15, v: true, shape: 'polo' },
  { id: 'mock', name: 'Mock neck', open: 1, depth: 0, turtle: true, mock: true },
  { id: 'turtle', name: 'Turtleneck', open: 1, depth: 0, turtle: true },
  { id: 'cowl', name: 'Cowl neck', open: 12, depth: 22, shape: 'cowl' },
  { id: 'offshoulder', name: 'Off the shoulder', open: 0, depth: 17, shape: 'off' },
  { id: 'strapless', name: 'Strapless', open: 0, depth: 36, shape: 'strapless' },
];
export const FACIAL: Option[] = [
  { id: 'none', name: 'None' }, { id: 'stubble', name: 'Stubble' }, { id: 'moustache', name: 'Moustache' }, { id: 'handlebar', name: 'Handlebar' },
  { id: 'horseshoe', name: 'Horseshoe' }, { id: 'goatee', name: 'Goatee' }, { id: 'circle', name: 'Circle beard' }, { id: 'vandyke', name: 'Van Dyke' },
  { id: 'soulpatch', name: 'Soul patch' }, { id: 'chinstrap', name: 'Chin strap' }, { id: 'chops', name: 'Mutton chops' }, { id: 'short', name: 'Short beard' },
  { id: 'full', name: 'Full beard' }, { id: 'long', name: 'Long beard' },
];
// Greying: 'auto' follows the age; the others are fixed amounts.
export const GREYING: Grey[] = [
  { id: 'auto', name: 'With age' }, { id: 'none', name: 'None', amount: 0 }, { id: 'touch', name: 'A touch of grey', amount: 0.18 },
  { id: 'salt', name: 'Salt and pepper', amount: 0.42 }, { id: 'grey', name: 'Grey', amount: 0.72 }, { id: 'white', name: 'White', amount: 0.95 },
];
export const AUTO_GREY: Record<string, number> = { middle: 0.12, older: 0.5, elderly: 0.82 };
// Hair is a length, a texture and a style, with a front (parting or fringe), a hairline (its shape and height) and its edges.
// Length: how far it falls from the crown when stretched, in head heights.
const LENGTH_ROWS = [
  { id: 'bald', name: 'Bald', L: 0 }, { id: 'buzzed', name: 'Buzzed', L: 0.02 }, { id: 'short', name: 'Short', L: 0.45 },
  { id: 'chin', name: 'Chin', L: 1.0 }, { id: 'shoulder', name: 'Shoulder', L: 1.45 }, { id: 'chest', name: 'Chest', L: 1.95 },
  { id: 'stomach', name: 'Stomach', L: 3.0 }, { id: 'hip', name: 'Hip', L: 4.0 }, { id: 'knee', name: 'Knee', L: 5.8 },
  { id: 'body', name: 'Body', L: 7.4 }, { id: 'rapunzel', name: 'Rapunzel', L: 11 },
];
export const LENGTHS: Length[] = LENGTH_ROWS.map((l, i) => ({ ...l, i }))
// Texture: 1 straight, 2 wavy, 3 curly, 4 coily; A fine (low porosity), B medium, C coarse (high porosity).
// vol: fullness; shrink: how much of the stretched length shows; amp/sp: the size and spacing of the waves or curls along the edge.
export const TEXTURES: Texture[] = [
  { id: '1A', name: '1A Straight, fine', kind: 'straight', vol: 0.78, shrink: 1 },
  { id: '1B', name: '1B Straight, medium', kind: 'straight', vol: 0.95, shrink: 1 },
  { id: '1C', name: '1C Straight, coarse', kind: 'straight', vol: 1.15, shrink: 1 },
  { id: '2A', name: '2A Wavy, fine', kind: 'wavy', vol: 0.95, shrink: 0.97, amp: 1.8, sp: 20 },
  { id: '2B', name: '2B Wavy, medium', kind: 'wavy', vol: 1.1, shrink: 0.94, amp: 2.8, sp: 16 },
  { id: '2C', name: '2C Wavy, coarse', kind: 'wavy', vol: 1.25, shrink: 0.9, amp: 3.8, sp: 13 },
  { id: '3A', name: '3A Curly, fine', kind: 'curly', vol: 1.45, shrink: 0.85, amp: 5, sp: 13 },
  { id: '3B', name: '3B Curly, medium', kind: 'curly', vol: 1.65, shrink: 0.75, amp: 5.2, sp: 11 },
  { id: '3C', name: '3C Curly, coarse', kind: 'curly', vol: 1.85, shrink: 0.65, amp: 4.6, sp: 9 },
  { id: '4A', name: '4A Coily, fine', kind: 'coily', vol: 2.0, shrink: 0.5, amp: 3.2, sp: 7 },
  { id: '4B', name: '4B Coily, medium', kind: 'coily', vol: 2.2, shrink: 0.4, amp: 2.8, sp: 6, zig: true },
  { id: '4C', name: '4C Coily, coarse', kind: 'coily', vol: 2.4, shrink: 0.32, amp: 2.4, sp: 5 },
];
const TIED: string[] = ['back', 'centre', 'side', 'bangs', 'curtain', 'sidebangs'];
// Style: min/max are the shortest and longest lengths it can be done with (indexes into LENGTHS); fronts, the fronts it allows.
export const STYLES: Style[] = [
  { id: 'plain', name: 'Plain', min: 0, max: 10 },
  { id: 'onebraid', name: '1 braid', min: 4, max: 10 },
  { id: 'twobraids', name: '2 braids', min: 4, max: 10 },
  { id: 'boxbraids', name: 'Full braids', min: 3, max: 10 },
  { id: 'trianglebraids', name: 'Triangle-part braids', min: 3, max: 10 },
  { id: 'locs', name: 'Locs', min: 2, max: 10 },
  { id: 'twists', name: 'Two-strand twists', min: 2, max: 10 },
  { id: 'cornrows', name: 'Cornrows', min: 2, max: 10, fronts: ['back'] },
  { id: 'bantu', name: 'Bantu knots', min: 2, max: 5, fronts: ['back', 'centre', 'side'] },
  { id: 'triangle', name: 'Triangle shape', min: 3, max: 5 },
  { id: 'puff', name: 'Puff', min: 3, max: 10, fronts: ['back', 'bangs', 'sidebangs'] },
  { id: 'topbun', name: 'Top bun', min: 3, max: 10, fronts: TIED },
  { id: 'lowbun', name: 'Low bun', min: 3, max: 10, fronts: TIED },
  { id: 'spacebuns', name: 'Space buns', min: 3, max: 10, fronts: TIED },
  { id: 'topknot', name: 'Top knot', min: 3, max: 10, fronts: TIED },
  { id: 'halfup', name: 'Half up', min: 4, max: 10 },
  { id: 'highpony', name: 'High ponytail', min: 3, max: 10, fronts: TIED },
  { id: 'lowpony', name: 'Low ponytail', min: 3, max: 10, fronts: TIED },
  { id: 'pigtails', name: 'Pigtails', min: 3, max: 10, fronts: TIED },
  { id: 'undercut', name: 'Undercut', min: 2, max: 4, fronts: ['none', 'side', 'back', 'sidebangs'] },
  { id: 'shavedside', name: 'Shaved side', min: 2, max: 10, fronts: ['none', 'side', 'sidebangs'] },
  { id: 'mohawk', name: 'Mohawk', min: 2, max: 3, fronts: ['none'] },
  { id: 'fade', name: 'Fade', min: 1, max: 2, fronts: ['none', 'side', 'back'] },
  { id: 'quiff', name: 'Quiff', min: 2, max: 3, fronts: ['none', 'back', 'side'] },
  { id: 'slicked', name: 'Slicked back', min: 2, max: 5, fronts: ['back'] },
];
export const FRONTS: Front[] = [
  { id: 'none', name: 'No part' }, { id: 'centre', name: 'Centre part' }, { id: 'side', name: 'Side part' }, { id: 'back', name: 'Swept back' },
  { id: 'bangs', name: 'Straight bangs', min: 2 }, { id: 'curtain', name: 'Curtain bangs', min: 3 }, { id: 'sidebangs', name: 'Side-swept bangs', min: 2 },
];
export const HAIRLINES: Option[] = [
  { id: 'rounded', name: 'Rounded' }, { id: 'straight', name: 'Straight' }, { id: 'widow', name: 'Widow’s peak' }, { id: 'mshape', name: 'M-shaped' },
  { id: 'uneven', name: 'Uneven' }, { id: 'mature', name: 'Mature' }, { id: 'receding', name: 'Receding' }, { id: 'deep', name: 'Deep recession' },
  { id: 'thinning', name: 'Thinning on top' },
];
export const HAIRLINE_HEIGHTS: HairlineHeight[] = [{ id: 'average', name: 'Average', dy: 0 }, { id: 'low', name: 'Low', dy: 0.04 }, { id: 'high', name: 'High', dy: -0.05 }];
export const EDGES: Option[] = [{ id: 'none', name: 'None' }, { id: 'baby', name: 'Baby hairs' }, { id: 'laid', name: 'Laid edges' }];
// The ends of hair that hangs: cut straight, or turned in toward the neck, or flicked out.
export const ENDS: Option[] = [{ id: 'straight', name: 'Straight' }, { id: 'in', name: 'Curve in' }, { id: 'out', name: 'Curve out' }];
// Where hair that hangs lies, as you look at the portrait: both sides in front, all of it in front over one shoulder, one side in front and the other behind, or all behind.
export const PLACEMENTS: Option[] = [
  { id: 'front', name: 'All front, even' }, { id: 'allleft', name: 'All front, left' }, { id: 'allright', name: 'All front, right' },
  { id: 'left', name: 'Left front' }, { id: 'right', name: 'Right front' }, { id: 'behind', name: 'All behind' },
];
// The hair settings a length, a style and a front depend on (the texture, the ends and the placement are there when they are known).
export interface HairFields { hairLength: string; hairStyle: string; hairFront: string; hairTexture?: string; hairEnds?: string; hairPlacement?: string }

// What fits: the styles a length allows, the fronts a length and style allow, and a hair choice made whole again (a style or a front that no longer fits becomes the first that does).
export function stylesFor(p: HairFields): Style[] {
  const i = pick(LENGTHS, p.hairLength, 'short').i
  return STYLES.filter(s => i >= s.min && i <= s.max)
}
export function frontsFor(p: HairFields): Front[] {
  const i = pick(LENGTHS, p.hairLength, 'short').i
  const st = pick(STYLES, p.hairStyle)
  if (i <= 1) return FRONTS.filter(f => f.id === 'none')
  return FRONTS.filter(f => (!st.fronts || st.fronts.includes(f.id)) && i >= (f.min || 0))
}
// Whether the hair hangs loose from the chin down (a coily texture stands out instead): the only hair whose ends and placement are a choice.
function hangs(p: HairFields): boolean {
  return pick(LENGTHS, p.hairLength, 'short').i >= 3 && pick(TEXTURES, p.hairTexture ?? '1B', '1B').kind !== 'coily'
}
// The placements the length and the style allow: hair that hangs loose has all six, a triangle and a shaved side only in front or behind, anything else is as its style has it.
export function placementsFor(p: HairFields): Option[] {
  if (!hangs(p)) return PLACEMENTS.filter(o => o.id === 'front')
  const style = p.hairStyle
  if (style === 'plain' || style === 'halfup') return PLACEMENTS
  if (style === 'triangle' || style === 'shavedside') return PLACEMENTS.filter(o => o.id === 'front' || o.id === 'behind')
  return PLACEMENTS.filter(o => o.id === 'front')
}
// The ends the length and the style allow: loose hair has all three, any other hair is cut straight.
export function endsFor(p: HairFields): Option[] {
  if (!hangs(p)) return ENDS.filter(o => o.id === 'straight')
  const style = p.hairStyle
  return style === 'plain' || style === 'halfup' || style === 'shavedside' ? ENDS : ENDS.filter(o => o.id === 'straight')
}
export function fitHair<T extends HairFields>(p: T): T {
  const q = { ...p }
  if (!stylesFor(q).some(s => s.id === q.hairStyle)) q.hairStyle = 'plain'
  const fr = frontsFor(q)
  if (!fr.some(f => f.id === q.hairFront)) q.hairFront = fr[0].id
  if (q.hairPlacement !== undefined && !placementsFor(q).some(o => o.id === q.hairPlacement)) q.hairPlacement = 'front'
  if (q.hairEnds !== undefined && !endsFor(q).some(o => o.id === q.hairEnds)) q.hairEnds = 'straight'
  return q
}
