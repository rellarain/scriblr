// The presets of the seed model: the nine ages, four builds and thirteen expressions (a preset is the sliders it moves; the rest stay where they are).
import type { ModelPreset } from '../../src/api/types'

const preset = (id: string, name: string, kind: string, values: Record<string, number>): ModelPreset => ({ id, name, kind, values, hidden: [] })

// Age: the proportions of the figure (height, the head against it, the legs) and the features that change with age (the eyes and the nose read larger and smaller on a child).
// Phase O8 adds what anatomy changes with age: a child's neck is shorter, its features sit lower in the face (the eye line below the middle of the head) and its body is
// softer and rounder; an older body softens and stoops (the neck leans toward the viewer and the shoulders round). An age leaves the build's measures (the neck's width,
// the arms, the legs, the jaw) to the build, so choosing one never undoes the other.
export const AGES: ModelPreset[] = [
  preset('age_infant', 'Infant', 'Age', { height: 36, headSize: 160, legLength: 62, eyeSize: 125, noseSize: 80, mouthSize: 90, earSize: 90, shoulders: 88, waist: 112, hips: 100, neckLength: 80, eyeLine: 3.5, soft: 90 }),
  preset('age_toddler', 'Toddler', 'Age', { height: 46, headSize: 150, legLength: 68, eyeSize: 118, noseSize: 84, mouthSize: 92, earSize: 92, shoulders: 90, waist: 108, hips: 98, neckLength: 84, eyeLine: 3, soft: 80 }),
  preset('age_child', 'Child', 'Age', { height: 62, headSize: 125, legLength: 92, eyeSize: 110, noseSize: 90, mouthSize: 95, earSize: 95, shoulders: 92, neckLength: 88, eyeLine: 2, soft: 50 }),
  preset('age_teen', 'Teen', 'Age', { height: 84, headSize: 110, legLength: 98, eyeSize: 104, noseSize: 96, neckLength: 96, eyeLine: 0.8, soft: 15 }),
  preset('age_young', 'Young adult', 'Age', { height: 100, eyeSize: 102 }),
  preset('age_adult', 'Adult', 'Age', {}),
  preset('age_middle', 'Middle-aged', 'Age', { height: 99, waist: 106, hips: 103, soft: 20 }),
  preset('age_older', 'Older', 'Age', { height: 96, headSize: 101, legLength: 98, waist: 108, shoulders: 97, soft: 30, stoop: 12 }),
  preset('age_elderly', 'Elderly', 'Age', { height: 92, headSize: 102, legLength: 96, waist: 106, shoulders: 93, eyeSize: 96, soft: 40, stoop: 30 }),
]

// The poses of the realistic body (phase O4b): sliders of the joints, each side on its own; Sitting turns the thighs toward the viewer (the depth sliders).
export const POSES: ModelPreset[] = [
  preset('pose_contrapposto', 'Contrapposto', 'Pose', { hipTilt: 5, waistBend: -3, chestBend: -3, headTilt: 3, legSpreadR: -2, thighDepthR: 18, shinDepthR: -18, shoulder: 3, shoulderR: 5, elbow: -6, elbowR: -10 }),
  preset('pose_hips', 'Hands on hips', 'Pose', { shoulder: 40, elbow: -105, wrist: 15, shoulderR: 40, elbowR: -105, wristR: 15 }),
  preset('pose_crossed', 'Arms crossed', 'Pose', { shoulder: -4, elbow: -98, armDepth: 15, foreDepth: -15, shoulderR: -4, elbowR: -92, armDepthR: 15, foreDepthR: -15 }),
  preset('pose_chin', 'Hand to chin', 'Pose', { shoulder: -18, armDepth: 55, elbow: -150, wrist: 20, headTilt: 4, shoulderR: -2, elbowR: -70, foreDepthR: 30 }),
  preset('pose_wave', 'Wave', 'Pose', { shoulder: 95, elbow: 80, headTilt: -3 }),
  preset('pose_sit', 'Sitting', 'Pose', { thighDepth: 72, thighDepthR: 72, shoulder: 6, shoulderR: 6, elbow: -40, elbowR: -40, foreDepth: 45, foreDepthR: 45 }),
]

// Build (phase O8: from anatomy, the slight, average, broad and heavy builds of an artist's references, not the old portrait's): the width of the shoulders, the waist and
// the hips, the neck, the size of the arms and legs and the jaw (the one place a build touches the face). Muscle is a slider of its own, whatever the build.
export const BUILDS: ModelPreset[] = [
  preset('build_slim', 'Slim', 'Build', { shoulders: 95, waist: 90, hips: 94, neckWidth: 92, armSize: 90, legSize: 91, jawWidth: -6 }),
  preset('build_average', 'Average', 'Build', {}),
  preset('build_broad', 'Broad', 'Build', { shoulders: 112, waist: 104, hips: 102, neckWidth: 112, armSize: 112, legSize: 107, jawWidth: 8 }),
  preset('build_heavy', 'Heavy', 'Build', { shoulders: 106, waist: 122, hips: 116, neckWidth: 116, armSize: 118, legSize: 116, jawWidth: 10 }),
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
