// The presets of the seed model: the nine ages, four builds and thirteen expressions (a preset is the sliders it moves; the rest stay where they are).
import type { ModelPreset } from '../../src/api/types'

const preset = (id: string, name: string, kind: string, values: Record<string, number>): ModelPreset => ({ id, name, kind, values, hidden: [] })

// Age: the proportions of the figure (height, the head against it, the legs) and the features that change with age (the eyes and the nose read larger and smaller on a child).
export const AGES: ModelPreset[] = [
  preset('age_infant', 'Infant', 'Age', { height: 36, headSize: 160, legLength: 62, eyeSize: 125, noseSize: 80, mouthSize: 90, earSize: 90, shoulders: 88, waist: 112, hips: 100 }),
  preset('age_toddler', 'Toddler', 'Age', { height: 46, headSize: 150, legLength: 68, eyeSize: 118, noseSize: 84, mouthSize: 92, earSize: 92, shoulders: 90, waist: 108, hips: 98 }),
  preset('age_child', 'Child', 'Age', { height: 62, headSize: 125, legLength: 92, eyeSize: 110, noseSize: 90, mouthSize: 95, earSize: 95, shoulders: 92 }),
  preset('age_teen', 'Teen', 'Age', { height: 84, headSize: 110, legLength: 98, eyeSize: 104, noseSize: 96 }),
  preset('age_young', 'Young adult', 'Age', { height: 100, eyeSize: 102 }),
  preset('age_adult', 'Adult', 'Age', {}),
  preset('age_middle', 'Middle-aged', 'Age', { height: 99, waist: 106, hips: 103 }),
  preset('age_older', 'Older', 'Age', { height: 96, headSize: 101, legLength: 98, waist: 108, shoulders: 97 }),
  preset('age_elderly', 'Elderly', 'Age', { height: 92, headSize: 102, legLength: 96, waist: 106, shoulders: 93, eyeSize: 96 }),
]

export const BUILDS: ModelPreset[] = [
  preset('build_slim', 'Slim', 'Build', { shoulders: 94, waist: 88, hips: 92 }),
  preset('build_average', 'Average', 'Build', {}),
  preset('build_broad', 'Broad', 'Build', { shoulders: 112, waist: 106, hips: 104 }),
  preset('build_heavy', 'Heavy', 'Build', { shoulders: 106, waist: 122, hips: 118 }),
]

// The old engine's thirteen expressions as the sliders of the eyes, brows and head (and the smile, when the model has one): how far the lids are open, how high the brows sit and
// how steeply they slope (inner end up is positive), the curve of the mouth.
const e = (id: string, name: string, v: { open: number; brow?: number; angle?: number; smile?: number; tilt?: number }): ModelPreset => {
  const values: Record<string, number> = { eyeOpen: v.open }
  if (v.brow) values.browHeight = v.brow
  if (v.angle) values.browAngle = v.angle
  if (v.smile) values.mouthCurve = v.smile
  if (v.tilt) values.headTilt = v.tilt
  return preset(id, name, 'Expression', values)
}
export const EXPRESSIONS: ModelPreset[] = [
  preset('exp_neutral', 'Neutral', 'Expression', {}),
  e('exp_soft', 'Soft smile', { open: 96, smile: 4 }),
  e('exp_smile', 'Smile', { open: 92, brow: 0.4, angle: 2, smile: 8, tilt: 2 }),
  e('exp_grin', 'Grin', { open: 86, brow: 0.6, angle: 3, smile: 10, tilt: 2 }),
  e('exp_laugh', 'Laugh', { open: 55, brow: 1, angle: 3, smile: 10, tilt: -4 }),
  e('exp_smirk', 'Smirk', { open: 94, brow: -0.6, angle: -2, smile: 3, tilt: 3 }),
  e('exp_stern', 'Stern', { open: 90, brow: -0.8, angle: -6, smile: -2 }),
  e('exp_angry', 'Angry', { open: 86, brow: -1.4, angle: -9, smile: -5 }),
  e('exp_sad', 'Sad', { open: 84, brow: 0.6, angle: 8, smile: -7, tilt: -5 }),
  e('exp_worried', 'Worried', { open: 108, brow: 1, angle: 9, smile: -3, tilt: -3 }),
  e('exp_surprised', 'Surprised', { open: 130, brow: 2.2 }),
  e('exp_sleepy', 'Sleepy', { open: 42, brow: -0.6, angle: 4, tilt: 5 }),
  e('exp_thoughtful', 'Thoughtful', { open: 92, brow: -0.9, smile: -1, tilt: 3 }),
]
