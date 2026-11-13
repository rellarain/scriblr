import { useState } from 'react'
import type { ModelContent, ModelGrip, ModelGroup } from '../../../../api/types'
import { BookmarkIcon, HandIcon, LinkIcon, PlusIcon, TrashIcon } from '../../../icons'
import { gripsOf, handSliders, slidersByRole } from './engine/hands'
import { LIMITS } from './engine/limits'
import { descendantsOf } from './engine/rig'
import { isApart, twinGroupOf } from './engine/sidesEdit'
import { NAME_MAX } from './modelContent'
import { Stepper } from './Stepper'
import type { HandActions } from './rigActions'

// The Hands section of the Rig tab (phase 5c): hang fingers, a thumb or a whole hand from the bottom of the selected group's lowest shape, pose the two hands on their
// own, add the starter hand poses, and place the grip points where a held item is taken. Buttons and steppers only: no typed numbers.
const f1 = (n: number) => Math.round(n * 10) / 10

export function HandSection({ content, group, held, actions }: { content: ModelContent; group: ModelGroup; held: string | null; actions: HandActions }) {
  const [confirm, setConfirm] = useState<string | null>(null)
  const twin = !!group.mirrorOf
  const inHand = new Set([group.id, ...descendantsOf(content, group.id)])
  const sliders = handSliders(content, group.id)
  const canApart = !twin && !!twinGroupOf(content, group.id) && sliders.some(r => !isApart(content, r))
  const canPose = !twin && Object.keys(slidersByRole(content, false, group.id)).some(r => r.startsWith('curl-'))
  const grips = gripsOf(content).filter(g => g.group && inHand.has(g.group))
  const gripFull = gripsOf(content).length >= LIMITS.gripsMax
  const why = twin ? 'A twin follows its original: build on the original group, and the twin gets a copy.' : null

  return (
    <>
      <section className="cmSec" aria-label="Hands and fingers">
        <h3 className="cmInsSub">Hands and fingers</h3>
        <p className="cmInsText">Hang fingers, a thumb or a whole hand from the bottom of this group&apos;s lowest shape. Each finger is one shape bent over two joints (its skin follows the palm at the knuckle) and gets a Curl slider; a hand also gets a Spread slider and the thumb its Swing and Across.</p>
        {why && <p className="cmInsText">{why}</p>}
        <div className="cmInline">
          <button type="button" className="cmBtn cmBtn--small" disabled={twin} title={why ?? 'A palm, four fingers and a thumb, each one shape bent over two joints, with their sliders (a twin arm gets a hand too, posed on its own)'} onClick={() => actions.addHand(group.id)}><HandIcon size={12} /> Add a whole hand</button>
          <button type="button" className="cmBtn cmBtn--small" disabled={twin} title={why ?? 'A finger: one shape bent over two joints, with one Curl slider'} onClick={() => actions.addFinger(group.id)}><PlusIcon size={12} /> Add a finger</button>
          <button type="button" className="cmBtn cmBtn--small" disabled={twin} title={why ?? 'A thumb on the side edge of the shape: one shape bent over two joints, with Swing, Curl and Across sliders'} onClick={() => actions.addThumb(group.id)}><PlusIcon size={12} /> Add a thumb</button>
        </div>
        {canApart && (
          <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small" title="Give the other hand a slider of its own for every slider of this one, so each hand takes its own pose" onClick={() => actions.apartHand(group.id)}><LinkIcon size={12} /> Pose the other hand apart</button>
          </div>
        )}
        {canPose && (
          <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small" title="Open, Fist, Point, Pinch and Grip as presets of kind Hand (and Hand (other side) when the other hand has sliders of its own)" onClick={() => actions.addPoses(group.id)}><BookmarkIcon size={12} /> Add the standard hand poses</button>
          </div>
        )}
      </section>

      <section className="cmSec" aria-label="Grip points">
        <h3 className="cmInsSub">Grip points</h3>
        <p className="cmInsText">A grip point is the spot of a hand where a held item is taken, and the way it points. It moves with the hand; a hand pose can name one, and in Pose mode dragging it reaches with the arm.</p>
        <div className="cmInline">
          <button type="button" className="cmBtn cmBtn--small" disabled={gripFull} title={gripFull ? `A model may have at most ${LIMITS.gripsMax} grip points` : 'Put a grip point in the middle of this group\'s lowest shape'} onClick={() => actions.addGrip(group.id)}><PlusIcon size={12} /> Add a grip point</button>
          <span className={`cmCount${gripsOf(content).length > LIMITS.gripsWarn ? ' cmCount--warn' : ''}`} title="Grip points of the model">{gripsOf(content).length} of {LIMITS.gripsMax}</span>
        </div>
        {grips.length === 0 && <p className="cmInsText">No grip point on this group yet.</p>}
        <ul className="cmPlain">
          {grips.map(g => gripRow(g))}
        </ul>
      </section>
    </>
  )

  function gripRow(g: ModelGrip) {
    const title = g.name.trim() || 'Grip'
    const on = held === g.id, hasTwin = !!g.group && !!twinGroupOf(content, g.group)
    return (
      <li key={g.id} className="cmGripRow" aria-label={`Grip point ${title}`}>
        <div className="cmSliderHead">
          <input className="cmSliderName" aria-label={`Name of grip point ${title}`} value={g.name} maxLength={NAME_MAX} placeholder="Name" onChange={e => actions.renameGrip(g.id, e.target.value)} />
          <button type="button" className={`cmChip cmChip--wide${on ? ' cmChip--on' : ''}`} aria-pressed={on} title="Show this grip as the one held now (a hand pose can name it)" onClick={() => actions.holdGrip(on ? null : g.id)}>Held</button>
        </div>
        <div className="cmSteps">
          <Stepper label={`Across for ${title}`} value={`${f1(g.x)}`} onStep={(dir, big) => actions.stepGrip(g.id, 'x', dir, big)} />
          <Stepper label={`Down for ${title}`} value={`${f1(g.y)}`} onStep={(dir, big) => actions.stepGrip(g.id, 'y', dir, big)} />
          <Stepper label={`Points (degrees) for ${title}`} value={`${f1(g.angle)}°`} onStep={(dir, big) => actions.stepGrip(g.id, 'angle', dir, big)} />
        </div>
        <div className="cmInline">
          <button type="button" className="cmBtn cmBtn--small" disabled={!hasTwin || gripFull} title={hasTwin ? 'Make the same grip on the other hand, mirrored' : 'The group has no twin'} onClick={() => actions.mirrorGrip(g.id)}><LinkIcon size={12} /> Make it on the other hand</button>
          {confirm === g.id ? (
            <span className="cmConfirm" role="group" aria-label={`Delete grip point ${title}?`}>
              <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirm(null); actions.removeGrip(g.id) }}>Delete it</button>
              <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirm(null)}>Keep it</button>
            </span>
          ) : <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete grip point ${title}`} title="Delete the grip point" onClick={() => setConfirm(g.id)}><TrashIcon size={12} /></button>}
        </div>
      </li>
    )
  }
}
