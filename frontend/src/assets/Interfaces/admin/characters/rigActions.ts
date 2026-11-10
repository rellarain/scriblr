import type { ModelAttach, ModelScaleAxis } from '../../../../api/types'
import type { Selection } from './designerState'

// What the Rig and Ranges tabs ask the page to do. The page (ModelPane) applies them to the content, keeps the undo stack and says why when one is refused.
export type NewSliderKind = 'turn' | 'scale' | 'points' | 'bend' | 'length' | 'fall'
export interface Recording { rangeId: string; shapeId: string; end: 'max' | 'min' }

export interface RigActions {
  selectGroup: (id: string) => void
  reparent: (groupId: string, parentId: string | null) => void
  // null takes the anchor away.
  setAttach: (groupId: string, att: ModelAttach | null) => void
  centerPivot: (groupId: string) => void
  // Start or stop picking an anchor by clicking a shape on the canvas.
  pick: (on: boolean) => void
  newSlider: (kind: NewSliderKind) => void
  renameRange: (id: string, name: string) => void
  stepBound: (id: string, field: 'min' | 'rest' | 'max', dir: -1 | 1, big: boolean) => void
  setShow: (id: string, show: boolean) => void
  removeRange: (id: string) => void
  addDrive: (rangeId: string, kind: NewSliderKind) => void
  removeDrive: (rangeId: string, index: number) => void
  stepDrive: (rangeId: string, index: number, field: 'atMin' | 'atMax', dir: -1 | 1, big: boolean) => void
  // A Length drive lengthens another bone.
  setDriveBone: (rangeId: string, index: number, boneId: string) => void
  // The smallest or largest value a writer may choose (phase 5a); clearLimit lets them choose anywhere on the slider.
  stepLimit: (rangeId: string, end: 'lo' | 'hi', dir: -1 | 1, big: boolean) => void
  clearLimit: (rangeId: string) => void
  setDriveAxis: (rangeId: string, index: number, axis: ModelScaleAxis) => void
  stepBend: (rangeId: string, index: number, edge: 'y0' | 'y1', dir: -1 | 1, big: boolean) => void
  // Record the points of a shape at the slider's maximum or minimum: the canvas edits a copy until finishRecording (or cancelRecording).
  record: (rangeId: string, shapeId: string, end: 'max' | 'min') => void
  finishRecording: () => void
  cancelRecording: () => void
  scrub: (rangeId: string) => void
  setValue: (rangeId: string, value: number) => void
  resetValues: () => void
  // Show this slider in the Ranges tab (from the Rig tab's Motion list).
  openSlider: (rangeId: string) => void
  // Select a shape (from the list of shapes a slider fades), and let every weighted shape of an object fall with a slider (phase 5b).
  selectShape: (id: string) => void
  fallObject: (rangeId: string, objectId: string) => void
  // Two sides apart (phase 5c): give the twin groups of a slider's turns and scales a slider of their own, or take it away again.
  apartSlider: (rangeId: string) => void
  joinSides: (rangeId: string) => void
  // Every slider that turns a group with a twin moves only its own side from now on (a model made before a pose belonged to one side).
  oneSideEach: () => void
}

// Phase 5c: hands. Fingers, a thumb or a whole hand hung from the bottom of a group, the other hand posed on its own, the starter hand poses, and the grip points
// where a held item is taken (with the one a pose holds shown on the canvas).
export interface HandActions {
  addFinger: (groupId: string, joints: 2 | 3) => void
  addThumb: (groupId: string) => void
  addHand: (groupId: string) => void
  apartHand: (groupId: string) => void
  addPoses: (groupId: string) => void
  addGrip: (groupId: string) => void
  renameGrip: (id: string, name: string) => void
  stepGrip: (id: string, field: 'x' | 'y' | 'angle', dir: -1 | 1, big: boolean) => void
  mirrorGrip: (id: string) => void
  removeGrip: (id: string) => void
  // The grip point shown as held now (null: none); a pose that names one does this when it is applied.
  holdGrip: (id: string | null) => void
}

// Phase 2b: pairs, point links and the back view.
export type PairKind = 'shape' | 'object' | 'group'
export type LinkHow = 'weld' | 'follow' | 'edge'
export type ViewName = 'front' | 'back'

export interface PairActions {
  select: (sel: Selection) => void
  makeTwin: (kind: PairKind, id: string) => void
  breakPair: (kind: PairKind, id: string) => void
  // Link the selected point: start picking what to link it to on the canvas (a click on a shape does it), or stop.
  startLink: (how: LinkHow) => void
  stopLink: () => void
  unlink: (shapeId: string, index: number) => void
  stepLink: (shapeId: string, index: number, field: 'o' | 't' | 'dx' | 'dy', dir: -1 | 1, big: boolean) => void
  // The slider a shape takes its looseness from (null: none), or a new one made for it.
  setLoose: (shapeId: string, rangeId: string | null) => void
  makeLoose: (shapeId: string) => void
  // A shape's outline for the back view goes back to the front one; a shape moves one place in front of or behind its neighbour in the view being edited.
  useFront: (shapeId: string) => void
  moveInOrder: (shapeId: string, dir: -1 | 1) => void
  // Bridges (phase 5b): make a point locked to an edge leave along that edge, or stop; start picking the four spots of a bridge on the canvas, or stop.
  setLeaves: (shapeId: string, index: number, on: boolean) => void
  startBridge: () => void
  stopBridge: () => void
}

// Phase 5a: proportions (the skeleton of bones), how an object fits the body, and frames.
export type BoneEndKind = 'group' | 'point'
export interface BonePick { boneId: string; end: 'end' }

export interface ProportionActions {
  // Add a bone from the selected group (else the first group) to a group that hangs from it (else any other group).
  addBone: () => void
  renameBone: (id: string, name: string) => void
  // Where a bone starts (a group) and ends (the pivot of a group, or point `i` of a shape).
  setStart: (id: string, groupId: string) => void
  setEnd: (id: string, kind: BoneEndKind, targetId: string, i: number) => void
  stepEndPoint: (id: string, dir: -1 | 1) => void
  // Choose the end of a bone by clicking the canvas (a pivot marker or a shape); stop picking.
  pickEnd: (id: string | null) => void
  removeBone: (id: string) => void
  setHeadBone: (id: string | null) => void
  // A new slider that lengthens a bone (and lists in the Ranges tab).
  lengthSlider: (boneId: string) => void
  openSlider: (rangeId: string) => void
}

export interface FitActions {
  setFit: (objectId: string, mode: 'scale' | 'keep' | 'stretch', fitTo?: string | null) => void
  pick: (on: boolean) => void
}

export interface FrameActions {
  add: () => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  select: (id: string | null) => void
  // Look at the canvas through a frame (null: the whole figure).
  through: (id: string | null) => void
  toggleHide: (id: string, thingId: string) => void
  // The card colour behind the figure: a test colour, kept as the model's starter tile on request.
  setTile: (hex: string) => void
  useTile: () => void
  resetTile: () => void
}
