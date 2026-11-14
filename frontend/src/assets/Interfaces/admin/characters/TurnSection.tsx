import type { ModelContent, ModelObject, ModelShape } from '../../../../api/types'
import { TrashIcon, UndoIcon } from '../../../icons'
import { Stepper } from './Stepper'
import { angleName } from './engine/angles'
import type { SolvedAngle } from './engine/rig'
import { layerThick } from './engine/turnEdit'

// How the selected shape turns with the figure (phase A3): how far it stands toward the viewer, how round it is, the depth of the point picked, the outlines drawn at key
// angles and the one at the angle seen now; for an object, the shape it lies on. Steppers and buttons only.

export interface TurnActions {
  stepDepth: (shapeId: string, dir: -1 | 1, big: boolean) => void
  stepThick: (shapeId: string, dir: -1 | 1, big: boolean) => void
  clearThick: (shapeId: string) => void
  stepPointDepth: (shapeId: string, i: number, dir: -1 | 1, big: boolean) => void
  clearPointDepths: (shapeId: string) => void
  setWrap: (objectId: string, shapeId: string | null) => void
  // Take away the outline drawn at the angle seen now (the shape is turned from the front there again).
  dropKey: (shapeId: string) => void
}
// Where the selected shape is seen from now: the front or the back as drawn before angles, a key spot (an outline can be drawn there), or between key spots.
export type TurnWhere = 'front' | 'back' | 'key' | 'between'

const spotName = (at: number, tilt: number) => `${angleName(at)}${tilt ? `, ${tilt > 0 ? 'looking up' : 'looking down'} ${Math.abs(tilt)}°` : ''}`

export function ShapeTurnSection({ content, shape, selPoint, where, spot, actions }: { content: ModelContent; shape: ModelShape; selPoint: number; where: TurnWhere; spot: SolvedAngle | undefined; actions: TurnActions }) {
  const name = shape.name.trim() || 'this shape'
  if (shape.mirrorOf) {
    return (
      <section className="cmSec" aria-label="Turning">
        <h3 className="cmInsSub">Turning</h3>
        <p className="cmInsText">A twin turns as its original does, seen from the other side: its outlines at key angles are its original&apos;s, mirrored.</p>
      </section>
    )
  }
  const t = shape.turn, own = t?.thick ?? null, keys = t?.angles ?? [], dz = t?.dz ?? []
  const pointDepth = dz[selPoint] ?? 0
  return (
    <section className="cmSec" aria-label="Turning">
      <h3 className="cmInsSub">Turning</h3>
      <Stepper label="Depth" value={`${t?.depth ?? 0} toward the viewer`} onStep={(dir, big) => actions.stepDepth(shape.id, dir, big)} bigBy={10} />
      <p className="cmInsText">How far its middle stands toward the viewer from its group&apos;s pivot: what it swings by as the figure turns.</p>
      <Stepper label="Roundness" value={own === null ? `${layerThick(content, shape.id)} (its layer's)` : `${own}`} onStep={(dir, big) => actions.stepThick(shape.id, dir, big)} bigBy={0.25} />
      {own !== null && (
        <button type="button" className="cmIconBtn" aria-label={`Use the layer's roundness for ${name}`} title="Use the layer's roundness" onClick={() => actions.clearThick(shape.id)}><UndoIcon size={13} /></button>
      )}
      <p className="cmInsText">How deep it is for its width: it narrows to that at the side when it has no depths of its own (0 flat, 1 round).</p>
      {shape.pts.length > 0 && (
        <>
          <Stepper label={`Depth of point ${selPoint + 1}`} value={`${pointDepth}`} onStep={(dir, big) => actions.stepPointDepth(shape.id, selPoint, dir, big)} bigBy={10} />
          {dz.length > 0 && (
            <button type="button" className="cmIconBtn" aria-label={`Clear the point depths of ${name}`} title="Clear the point depths (it turns as a rounded cut-out again)" onClick={() => actions.clearPointDepths(shape.id)}><TrashIcon size={13} /></button>
          )}
          <p className="cmInsText">{dz.length > 0 ? 'Its points stand at depths of their own: it turns point by point.' : 'Give a point a depth (the tip of the nose, a toe) and the shape turns point by point.'}</p>
        </>
      )}
      <h3 className="cmInsSub">Drawn at angles <span className="cmCount">{keys.length}</span></h3>
      {keys.length > 0
        ? <p className="cmInsText">{keys.map(k => spotName(k.at, k.tilt)).join('; ')}.</p>
        : <p className="cmInsText">None yet: turn the figure to a key angle (a multiple of 15 degrees) and move its points to draw it there.</p>}
      {where === 'key' && spot && (
        spot.drawn ? (
          <p className="cmInsText">
            Seen at {spotName(spot.at, spot.tilt)}: drawn here.{' '}
            <button type="button" className="cmIconBtn" aria-label={`Drop the outline of ${name} at this angle`} title="Drop the outline at this angle (it is turned from the front here again)" onClick={() => actions.dropKey(shape.id)}><TrashIcon size={13} /></button>
          </p>
        ) : <p className="cmInsText">Seen at {spotName(spot.at, spot.tilt)}: turned from the front. Move a point to draw it here; it keeps the front&apos;s points.</p>
      )}
      {where === 'between' && <p className="cmInsText">Seen between key angles: turn to a multiple of 15 degrees to draw it.</p>}
    </section>
  )
}

export function ObjectTurnSection({ content, object, actions }: { content: ModelContent; object: ModelObject; actions: TurnActions }) {
  const name = object.name.trim() || 'this object'
  if (object.mirrorOf) return null
  const choices = content.shapes.filter(s => !object.shapes.includes(s.id) && !s.mirrorOf && s.closed)
  return (
    <section className="cmSec" aria-label="Turning">
      <h3 className="cmInsSub">Turning</h3>
      <label className="cmField">
        <span>Lies on</span>
        <select value={object.wrap ?? ''} aria-label={`The shape ${name} lies on`} onChange={e => actions.setWrap(object.id, e.target.value || null)}>
          <option value="">Nothing (it turns on its own)</option>
          {choices.map(s => <option key={s.id} value={s.id}>{s.name.trim() || s.id}</option>)}
        </select>
      </label>
      <p className="cmInsText">An object that lies on a shape (an eye on the skull) takes its depths from that shape&apos;s rounded surface, so it slides round it as the figure turns.</p>
    </section>
  )
}
