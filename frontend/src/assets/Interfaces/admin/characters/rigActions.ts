import type { ModelAttach, ModelScaleAxis } from '../../../../api/types'

// What the Rig and Ranges tabs ask the page to do. The page (ModelPane) applies them to the content, keeps the undo stack and says why when one is refused.
export type NewSliderKind = 'turn' | 'scale' | 'points' | 'bend'
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
}
