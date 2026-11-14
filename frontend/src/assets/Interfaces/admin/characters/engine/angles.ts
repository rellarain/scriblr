// The angles a figure is seen from (phase A1). The front is 0 and the back 180; in between the figure is turned about the up and down line through its middle (the model's
// axis), and an angle is named by the side of the character that is toward the viewer: at 90 the character's right side (the right profile), at 270 the left.
// A view is 'front', 'back' or a number of degrees; every place that draws a figure passes one of those.
export type View = 'front' | 'back' | number

export interface NamedAngle { id: string; name: string; at: number }
export const ANGLES: NamedAngle[] = [
  { id: 'front', name: 'Front', at: 0 },
  { id: 'frontRight', name: 'Front right', at: 45 },
  { id: 'right', name: 'Right profile', at: 90 },
  { id: 'backRight', name: 'Back right', at: 135 },
  { id: 'back', name: 'Back', at: 180 },
  { id: 'backLeft', name: 'Back left', at: 225 },
  { id: 'left', name: 'Left profile', at: 270 },
  { id: 'frontLeft', name: 'Front left', at: 315 },
]

// A number of degrees held to 0..360 (0 for anything that is not a number).
export const wrapAngle = (a: number): number => (Number.isFinite(a) ? ((a % 360) + 360) % 360 : 0)
// The angle of a view, 0..360.
export const angleOf = (view: View | undefined | null): number => (view === 'back' ? 180 : typeof view === 'number' ? wrapAngle(view) : 0)
// Whether a view is the front or the back exactly: drawn the way every figure was drawn before angles, with nothing turned.
export const isFlat = (view: View | undefined | null): boolean => { const a = angleOf(view); return a === 0 || a === 180 }
// Whether a view shows more of the back than of the front (the sheets of the editor lie in front of the figure, a shape's own back outline is drawn).
export const fromBehind = (view: View | undefined | null): boolean => Math.cos((angleOf(view) * Math.PI) / 180) < -1e-9
// The name of the angle a view shows, or its degrees when it is between named ones.
export function angleName(view: View | undefined | null): string {
  const a = angleOf(view), named = ANGLES.find(n => Math.abs(n.at - a) < 0.5)
  return named ? named.name : `${Math.round(a)}°`
}
// The named angle nearest to a view.
export function nearestAngle(view: View | undefined | null): NamedAngle {
  const a = angleOf(view)
  let best = ANGLES[0], gap = 999
  for (const n of ANGLES) { const g = Math.min(Math.abs(n.at - a), 360 - Math.abs(n.at - a)); if (g < gap) { gap = g; best = n } }
  return best
}
// A view as it is kept: 'front' and 'back' for those two, else the angle in whole degrees.
export function viewFor(a: number): View {
  const w = Math.round(wrapAngle(a)) % 360
  return w === 0 ? 'front' : w === 180 ? 'back' : w
}
