import type { ModelBind, ModelContent, ModelShape } from '../../../../api/types'
import { BackIcon, BridgeIcon, ChevronDownIcon, ChevronUpIcon, FrontIcon, LinkIcon, PlusIcon, SwapIcon, UnlockIcon } from '../../../icons'
import { Stepper } from './Stepper'
import type { Selection } from './designerState'
import { LIMITS, linkCount } from './engine/limits'
import { linksOf } from './engine/pairEdit'
import type { LinkHow, PairActions, PairKind, ViewName } from './rigActions'
import { groupById, objectById, shapeById, twinsOf } from './modelContent'

// The panels of phase 2b: pairs (a twin that mirrors a shape, object or group, and breaking the pair), point links (a point welded to, following, or locked to
// the edge of another shape) and what a shape does in the back view (an outline of its own, its depth, how loose its links are). They sit in the Shape tab
// and, for a group, in the Rig tab; every number is a stepper, and every action says why when it cannot be done.

const nameOf = (c: ModelContent, kind: PairKind, id: string): string => {
  const t = kind === 'shape' ? shapeById(c, id) : kind === 'object' ? objectById(c, id) : groupById(c, id)
  return t?.name.trim() || `Untitled ${kind}`
}
const selectionOf = (kind: PairKind, id: string): Selection => ({ kind, id })

// Pair / Break the pair for one shape, object or group.
export function PairPanel({ content, kind, id, actions }: { content: ModelContent; kind: PairKind; id: string; actions: PairActions }) {
  const thing = kind === 'shape' ? shapeById(content, id) : kind === 'object' ? objectById(content, id) : groupById(content, id)
  if (!thing) return null
  const name = nameOf(content, kind, id)
  const twins = twinsOf(content, kind, id)
  const original = thing.mirrorOf
  const scope = kind === 'group' ? 'with everything in it and under it' : kind === 'object' ? 'with its shapes' : ''
  return (
    <section className="cmSec" aria-label="Pair">
      <h3 className="cmInsSub">Pair</h3>
      {original ? (
        <>
          <p className="cmInsText">
            This is the twin of <button type="button" className="cmLink" onClick={() => actions.select(selectionOf(kind, original))}>{nameOf(content, kind, original)}</button>: a mirror image about the mirror line that follows every edit and every slider that moves it. Edit the original, or break the pair to edit this by itself{kind === 'group' ? ' (the twin groups under it go with it)' : ''}.
          </p>
          <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small" aria-label={`Break the pair of ${name}`} onClick={() => actions.breakPair(kind, id)}><UnlockIcon size={12} /> Break the pair</button>
          </div>
        </>
      ) : twins.length ? (
        <p className="cmInsText">
          Has a twin: {twins.map((t, i) => <span key={t}>{i > 0 && ', '}<button type="button" className="cmLink" onClick={() => actions.select(selectionOf(kind, t))}>{nameOf(content, kind, t)}</button></span>)}. Whatever you change here, the twin mirrors.
        </p>
      ) : (
        <>
          <p className="cmInsText">A twin is a mirror image of this {kind} about the mirror line{scope ? ` ${scope}` : ''}; it follows every edit, so one side is drawn once.</p>
          <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small" aria-label={`Make a twin of ${name}`} title="Make a mirror image that follows every edit" onClick={() => actions.makeTwin(kind, id)}><SwapIcon size={12} /> Make a twin</button>
          </div>
        </>
      )}
    </section>
  )
}

const BRIDGE_STEPS = [
  'click the edge of the first part, where one side of the bridge leaves it',
  'click the edge of the other part, where that side arrives',
  'for the other side, click an edge of either part',
  'click the edge of the other part again',
]

const HOWS: Array<{ id: LinkHow; name: string; hint: string }> = [
  { id: 'weld', name: 'Weld', hint: 'Put the point exactly on a point of another shape.' },
  { id: 'follow', name: 'Follow', hint: 'Keep the point where it is and move it with a point of another shape.' },
  { id: 'edge', name: 'Lock to an edge', hint: 'Keep the point at its place along the edge of another shape, as far out as it is now.' },
]

function describe(c: ModelContent, b: ModelBind): string {
  const target = shapeById(c, b.s)?.name.trim() || 'a shape'
  if (b.kind === 'edge') return `locked to the edge from point ${b.e + 1} of ${target}, ${b.o} out${b.tan ? ', leaves along the edge' : ''}`
  return b.d[0] === 0 && b.d[1] === 0 ? `welded to point ${b.i + 1} of ${target}` : `follows point ${b.i + 1} of ${target} (${b.d[0]}, ${b.d[1]} away)`
}

// Point links of the selected shape: link the selected point by clicking a shape on the canvas, and adjust or cut each link.
export function LinksPanel({ content, shape, selPoint, linkMode, bridge, actions }: { content: ModelContent; shape: ModelShape; selPoint: number; linkMode: LinkHow | null; bridge?: number | null; actions: PairActions }) {
  if (shape.mirrorOf) return null
  const links = linksOf(content, shape.id)
  const here = shape.pts[selPoint]?.bind
  const total = linkCount(content)
  return (
    <section className="cmSec cmLinks" aria-label="Links">
      <h3 className="cmInsSub">Links <span className={`cmCount${total > LIMITS.linksWarn ? ' cmCount--warn' : ''}`} title="Point links in the model">{total} of {LIMITS.linksMax}</span></h3>
      <p className="cmInsText">Link point {selPoint + 1} to another shape so it follows it: clothes that stay on the body.</p>
      <div className="cmChips" role="group" aria-label={`Link point ${selPoint + 1}`}>
        {HOWS.map(h => (
          <button key={h.id} type="button" className={`cmChip cmChip--wide${linkMode === h.id ? ' cmChip--on' : ''}`} aria-pressed={linkMode === h.id} title={h.hint} onClick={() => (linkMode === h.id ? actions.stopLink() : actions.startLink(h.id))}><LinkIcon size={11} /> {h.name}</button>
        ))}
      </div>
      <div className="cmInline">
        <button type="button" className={`cmBtn cmBtn--small${bridge != null ? ' cmBtn--primary' : ''}`} aria-pressed={bridge != null} title="Join two parts with skin: click four spots on the edges of the two parts" onClick={() => (bridge != null ? actions.stopBridge() : actions.startBridge())}><BridgeIcon size={12} /> {bridge != null ? 'Stop the bridge' : 'Add a bridge'}</button>
      </div>
      {bridge != null && <p className="cmInsText" role="status">Bridge: {BRIDGE_STEPS[Math.min(bridge, 3)]} (spot {Math.min(bridge, 3) + 1} of 4). Escape stops.</p>}
      {linkMode && <p className="cmInsText" role="status">Click the shape to link point {selPoint + 1} to{linkMode === 'edge' ? ' (the point goes to the edge nearest your click).' : ' (the point nearest your click).'} Escape stops.</p>}
      {here && <div className="cmInline"><button type="button" className="cmBtn cmBtn--small" aria-label={`Unlink point ${selPoint + 1}`} onClick={() => actions.unlink(shape.id, selPoint)}><UnlockIcon size={12} /> Unlink point {selPoint + 1}</button></div>}
      {links.length === 0 ? <p className="cmInsText">None of this shape&apos;s points is linked.</p> : (
        <ul className="cmPlain">
          {links.map(({ index, bind }) => (
            <li key={index} className="cmLink-item">
              <p className="cmInsText">Point {index + 1}: {describe(content, bind)}</p>
              <div className="cmSteps">
                {bind.kind === 'edge' ? (
                  <>
                    <Stepper label={`Distance from the edge (point ${index + 1})`} value={`${bind.o}`} onStep={(dir, big) => actions.stepLink(shape.id, index, 'o', dir, big)} />
                    <Stepper label={`Spot along the edge (point ${index + 1})`} value={`${Math.round(bind.t * 100)}%`} onStep={(dir, big) => actions.stepLink(shape.id, index, 't', dir, big)} />
                    <button type="button" className={`cmChip cmChip--wide${bind.tan ? ' cmChip--on' : ''}`} aria-pressed={!!bind.tan} aria-label={`Point ${index + 1} leaves along its edge`} title="Let the outline leave this point along the direction of the edge it is locked to, so it runs on smoothly (the two ends of a bridge)" onClick={() => actions.setLeaves(shape.id, index, !bind.tan)}>Leaves along the edge</button>
                  </>
                ) : (
                  <>
                    <Stepper label={`Offset across (point ${index + 1})`} value={`${bind.d[0]}`} onStep={(dir, big) => actions.stepLink(shape.id, index, 'dx', dir, big)} />
                    <Stepper label={`Offset down (point ${index + 1})`} value={`${bind.d[1]}`} onStep={(dir, big) => actions.stepLink(shape.id, index, 'dy', dir, big)} />
                  </>
                )}
              </div>
              <button type="button" className="cmLink" aria-label={`Unlink point ${index + 1} of the list`} onClick={() => actions.unlink(shape.id, index)}>Unlink</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// What a shape does in the view being edited: its depth (in front of or behind the shape next to it), its outline for the back, and the slider that loosens its links.
export function ViewPanel({ content, shape, view, actions }: { content: ModelContent; shape: ModelShape; view: ViewName; actions: PairActions }) {
  const name = shape.name.trim() || 'the shape'
  const hasLinks = shape.pts.some(p => p.bind)
  return (
    <section className="cmSec" aria-label={`In the ${view} view`}>
      <h3 className="cmInsSub">In the {view} view</h3>
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" aria-label={`Move ${name} in front in the ${view} view`} onClick={() => actions.moveInOrder(shape.id, 1)}><ChevronUpIcon size={12} /> In front</button>
        <button type="button" className="cmBtn cmBtn--small" aria-label={`Move ${name} behind in the ${view} view`} onClick={() => actions.moveInOrder(shape.id, -1)}><ChevronDownIcon size={12} /> Behind</button>
      </div>
      <p className="cmInsText">The order is kept for this view only once you move a shape in the back view; until then the back follows the front.</p>
      {!shape.mirrorOf && (view === 'back' ? (
        shape.back ? (
          <>
            <p className="cmInsText"><BackIcon size={11} /> It has an outline of its own for the back.</p>
            <div className="cmInline"><button type="button" className="cmBtn cmBtn--small" onClick={() => actions.useFront(shape.id)}><FrontIcon size={12} /> Use the front outline again</button></div>
          </>
        ) : <p className="cmInsText"><BackIcon size={11} /> It shows its front outline from behind. Edit its points here to give it an outline of its own for the back.</p>
      ) : shape.back ? <p className="cmInsText"><BackIcon size={11} /> It has an outline of its own for the back (switch to the back view to edit it).</p> : null)}
      {!shape.mirrorOf && (
        <div className="cmField">
          <span>Looseness</span>
          <span className="cmInline">
            <select value={shape.loose ?? ''} aria-label="Slider that loosens the links" onChange={e => actions.setLoose(shape.id, e.target.value || null)}>
              <option value="">None: links keep their distance</option>
              {content.ranges.map(r => <option key={r.id} value={r.id}>{r.name.trim() || r.id}</option>)}
            </select>
            <button type="button" className="cmBtn cmBtn--small" disabled={!hasLinks || content.ranges.length >= LIMITS.rangesMax} title={hasLinks ? 'Make a slider that loosens or tightens the links of this shape' : 'Link a point first'} onClick={() => actions.makeLoose(shape.id)}><PlusIcon size={12} /> Make a slider</button>
          </span>
        </div>
      )}
    </section>
  )
}
