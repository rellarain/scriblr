import type { ModelFeatureKind } from '../../../../../api/types'

// Authored fields (phase D3c): the properties a slider can change on a feature. A feature is a whole shape, one point or one edge of a shape, or a whole object; a
// property is what the slider's `prop` drive sets, from the amount it has at the slider's minimum (`atMin`) through the amount at rest to the amount at its maximum
// (`atMax`). Pure data: the solver (rig.ts) and the paint (colour.ts) read the amounts, the Fields tab lists the properties a feature has. The table is the backend's
// MODEL_PROPS (schemaParity.test.ts keeps them the same).

export type PropKey =
  | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'curve' | 'length' | 'texture' | 'opacity' | 'roundness' | 'z' | 'offset'
  | 'fillHue' | 'fillSat' | 'fillLight'
  | 'gradReach' | 'gradBlend' | 'gradDir' | 'gradHue' | 'gradSat' | 'gradLight'

export type PropGroup = 'place' | 'size' | 'look' | 'colour' | 'gradient'

export interface PropSpec {
  key: PropKey
  label: string
  group: PropGroup
  features: readonly ModelFeatureKind[]
  // the amount at the slider's rest, and the least and most an amount may be
  rest: number
  lo: number
  hi: number
  unit: '' | '°' | '%'
  // a new field's slider (smallest, resting, largest) and the amounts it has at its ends: by default the slider shows the property itself
  slider: readonly [number, number, number]
  amounts: readonly [number, number]
  // what the property is, said once, for the Fields tab
  hint: string
}

const WHOLE: readonly ModelFeatureKind[] = ['shape', 'object']

const spec = (s: PropSpec): [PropKey, PropSpec] => [s.key, s]
export const PROPS: Record<PropKey, PropSpec> = Object.fromEntries([
  spec({ key: 'x', label: 'Position across', group: 'place', features: ['shape', 'object', 'point'], rest: 0, lo: -200, hi: 200, unit: '', slider: [-20, 0, 20], amounts: [-20, 20], hint: 'Moves it sideways, in the units of the model.' }),
  spec({ key: 'y', label: 'Position up and down', group: 'place', features: ['shape', 'object', 'point'], rest: 0, lo: -200, hi: 200, unit: '', slider: [-20, 0, 20], amounts: [-20, 20], hint: 'Moves it up or down, in the units of the model.' }),
  spec({ key: 'width', label: 'Width', group: 'size', features: WHOLE, rest: 100, lo: 5, hi: 1000, unit: '%', slider: [50, 100, 150], amounts: [50, 150], hint: 'Its width as a percent of the width it is drawn with.' }),
  spec({ key: 'height', label: 'Height', group: 'size', features: WHOLE, rest: 100, lo: 5, hi: 1000, unit: '%', slider: [50, 100, 150], amounts: [50, 150], hint: 'Its height as a percent of the height it is drawn with.' }),
  spec({ key: 'rotation', label: 'Rotation', group: 'place', features: WHOLE, rest: 0, lo: -360, hi: 360, unit: '°', slider: [-30, 0, 30], amounts: [-30, 30], hint: 'Turns it about its middle.' }),
  spec({ key: 'curve', label: 'Curve the ends', group: 'place', features: WHOLE, rest: 0, lo: -50, hi: 50, unit: '', slider: [-10, 0, 10], amounts: [-2, 2], hint: 'Lifts the two ends of it against its middle (a smile), or drops them (a frown), in the units of the model.' }),
  spec({ key: 'length', label: 'Length', group: 'size', features: WHOLE, rest: 100, lo: 0, hi: 1000, unit: '%', slider: [50, 100, 200], amounts: [50, 200], hint: 'Stretches the free ends of it (the points that have a weight: a lock of hair hangs from the points that hold it) away from the points that hold it, as a percent of how long it is drawn.' }),
  spec({ key: 'texture', label: 'Texture', group: 'look', features: WHOLE, rest: 0, lo: 0, hi: 100, unit: '', slider: [0, 0, 99], amounts: [0, 99], hint: 'Draws the edges of it that hang (between the points that have a weight; all of it when nothing in its object has a weight) with a texture: 0 is straight, then wavy, curly and coily (11, 22 ... 99 are the 2A to 4C of the old portrait). The points stay where they are.' }),
  spec({ key: 'opacity', label: 'Opacity', group: 'look', features: WHOLE, rest: 100, lo: 0, hi: 100, unit: '%', slider: [0, 100, 100], amounts: [0, 100], hint: 'How much of its own opacity it keeps.' }),
  spec({ key: 'roundness', label: 'Corner roundness', group: 'look', features: WHOLE, rest: 0, lo: -20, hi: 20, unit: '', slider: [0, 0, 20], amounts: [0, 20], hint: 'Adds to the radius its sharp corners are rounded to (less than none is none).' }),
  spec({ key: 'z', label: 'Depth order', group: 'place', features: WHOLE, rest: 0, lo: -60, hi: 60, unit: '', slider: [-20, 0, 20], amounts: [-20, 20], hint: 'Adds to its depth, so it is drawn in front of more (+) or fewer (-) of the shapes around it: an arm that points away goes behind the body.' }),
  spec({ key: 'offset', label: 'Push the edge', group: 'place', features: ['edge'], rest: 0, lo: -200, hi: 200, unit: '', slider: [-20, 0, 20], amounts: [-20, 20], hint: 'Pushes the edge outward (or inward) by moving both of its points.' }),
  spec({ key: 'fillHue', label: 'Fill hue', group: 'colour', features: WHOLE, rest: 0, lo: -180, hi: 180, unit: '°', slider: [-90, 0, 90], amounts: [-90, 90], hint: 'Turns the hue of the colour it is painted with.' }),
  spec({ key: 'fillSat', label: 'Fill saturation', group: 'colour', features: WHOLE, rest: 0, lo: -100, hi: 100, unit: '%', slider: [-50, 0, 50], amounts: [-50, 50], hint: 'Makes the colour it is painted with more or less saturated.' }),
  spec({ key: 'fillLight', label: 'Fill lightness', group: 'colour', features: WHOLE, rest: 0, lo: -100, hi: 100, unit: '%', slider: [-50, 0, 50], amounts: [-50, 50], hint: 'Makes the colour lighter or darker, inside the brightness the slot allows.' }),
  spec({ key: 'gradReach', label: 'Gradient reach', group: 'gradient', features: WHOLE, rest: 100, lo: 0, hi: 200, unit: '%', slider: [0, 100, 200], amounts: [0, 200], hint: 'How far the gradient reaches: 100 % is across the whole shape.' }),
  spec({ key: 'gradBlend', label: 'Gradient blend', group: 'gradient', features: WHOLE, rest: 100, lo: 0, hi: 100, unit: '%', slider: [0, 100, 100], amounts: [0, 100], hint: 'How much of the second colour it blends to: 0 % is the colour alone.' }),
  spec({ key: 'gradDir', label: 'Gradient direction', group: 'gradient', features: WHOLE, rest: 0, lo: -360, hi: 360, unit: '°', slider: [-90, 0, 90], amounts: [-90, 90], hint: 'Turns the direction of a linear gradient (a radial one has none).' }),
  spec({ key: 'gradHue', label: 'Second colour hue', group: 'gradient', features: WHOLE, rest: 0, lo: -180, hi: 180, unit: '°', slider: [-90, 0, 90], amounts: [-90, 90], hint: 'Turns the hue of the colour the gradient goes to.' }),
  spec({ key: 'gradSat', label: 'Second colour saturation', group: 'gradient', features: WHOLE, rest: 0, lo: -100, hi: 100, unit: '%', slider: [-50, 0, 50], amounts: [-50, 50], hint: 'Makes the colour the gradient goes to more or less saturated.' }),
  spec({ key: 'gradLight', label: 'Second colour lightness', group: 'gradient', features: WHOLE, rest: 0, lo: -100, hi: 100, unit: '%', slider: [-50, 0, 50], amounts: [-50, 50], hint: 'Makes the colour the gradient goes to lighter or darker.' }),
]) as Record<PropKey, PropSpec>

// The most a corner radius may be (the backend's MODEL_ROUND_MAX; LIMITS.roundMax is the same number).
export const ROUND_MAX = 20

export const PROP_KEYS = Object.keys(PROPS) as PropKey[]
export const isProp = (k: string | null | undefined): k is PropKey => !!k && Object.prototype.hasOwnProperty.call(PROPS, k)
// The properties a kind of feature has, in the order the Fields tab lists them.
export const propsOf = (feature: ModelFeatureKind): PropSpec[] => PROP_KEYS.map(k => PROPS[k]).filter(p => p.features.includes(feature))
export const hasProp = (feature: ModelFeatureKind, key: string | null | undefined): boolean => isProp(key) && PROPS[key].features.includes(feature)

export const FEATURE_LABELS: Record<ModelFeatureKind, string> = { shape: 'Shape', point: 'Point', edge: 'Edge', object: 'Object' }
export const GROUP_LABELS: Record<PropGroup, string> = { place: 'Place', size: 'Size', look: 'Look', colour: 'Fill colour', gradient: 'Gradient' }

// The properties that change how a shape is painted rather than where it is: the paint reads these and the solver does not.
export const PAINT_PROPS: readonly PropKey[] = ['fillHue', 'fillSat', 'fillLight', 'gradReach', 'gradBlend', 'gradDir', 'gradHue', 'gradSat', 'gradLight']
export const isPaintProp = (k: string | null | undefined): boolean => !!k && (PAINT_PROPS as readonly string[]).includes(k)
// The properties that change how a shape is drawn without moving its points: its opacity, the rounding of its corners, its depth order and the texture of its edge
// (the points stay where they were drawn).
export const isDrawingProp = (k: string | null | undefined): boolean => k === 'opacity' || k === 'roundness' || k === 'z' || k === 'texture'
