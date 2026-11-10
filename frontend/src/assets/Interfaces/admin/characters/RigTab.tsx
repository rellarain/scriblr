import type { ModelAnchorKind, ModelAttach, ModelContent, ModelGroup, ModelObject } from '../../../../api/types'
import { LIMITS } from './engine/limits'
import { chainDepth, chainOf, descendantsOf } from './engine/rig'
import { groupOfShape } from './engine/rigEdit'
import { FitSection } from './FitSection'
import { WearSection } from './WearSection'
import { HandSection } from './HandSection'
import { PairPanel } from './PairPanels'
import { Stepper } from './Stepper'
import type { FitActions, HandActions, PairActions, RigActions, WearActions } from './rigActions'
import { outlineSize } from './modelContent'
import { rangesMovingGroup } from './rigView'

// The Rig tab: where the selected group hangs (its chain of parents and pivots), what it is fixed to on its parent (the four kinds of anchor), and which
// sliders move it. Everything is a button, a chip or a slider: no typed numbers.
const KINDS: Array<{ id: ModelAnchorKind | 'none'; name: string; hint: string }> = [
  { id: 'none', name: 'None', hint: 'Not fixed to a shape: it stays where it is drawn.' },
  { id: 'point', name: 'Point', hint: 'Fixed on one point of the shape.' },
  { id: 'edge', name: 'Edge spot', hint: 'Fixed at a spot along one edge of the shape.' },
  { id: 'range', name: 'Slides', hint: 'Fixed along one edge, where a slider puts it.' },
  { id: 'inside', name: 'Inside', hint: 'Fixed at a relative place inside the shape.' },
]
const name = (g: { name: string; id: string }) => g.name.trim() || 'Untitled group'
const f1 = (n: number) => Math.round(n * 10) / 10

export function RigTab({ content, group, object, picking, fitPicking, actions, pairs, fit, wear, hands, held }: {
  content: ModelContent
  group: ModelGroup | undefined
  // The selected object (or the object of the selected shape), whose fit to the body is chosen here.
  object: ModelObject | undefined
  picking: boolean
  fitPicking: boolean
  actions: RigActions
  pairs: PairActions
  fit: FitActions
  wear: WearActions
  hands: HandActions
  // The grip point shown as held now.
  held: string | null
}) {
  if (!group) {
    return (
      <div className="cmTabBody">
        <p className="cmInsText">Select a group, or an object or shape in one, to see how it hangs in the rig.</p>
      </div>
    )
  }
  const depth = chainDepth(content, group.id), chain = chainOf(content, group.id)
  const below = descendantsOf(content, group.id)
  const parents = content.groups.filter(g => g.id !== group.id && !below.has(g.id))
  const att = group.attach
  // the shapes it can be fixed to: those of its parent and the groups above
  const ancestors = group.parent ? chainOf(content, group.parent) : []
  const targets = content.shapes.filter(s => { const home = groupOfShape(content, s.id); return !!home && ancestors.includes(home) && outlineSize(content, s) >= 3 })
  const target = att ? content.shapes.find(s => s.id === att.shape) : undefined
  const moving = rangesMovingGroup(content, group.id)

  function chooseKind(kind: ModelAnchorKind | 'none') {
    if (kind === 'none') { actions.pick(false); actions.setAttach(group!.id, null); return }
    const shape = target ?? targets[0]
    if (!shape) return
    const slider = kind === 'range' ? (att?.slider ?? content.ranges[0]?.id ?? null) : null
    if (kind === 'range' && !slider) return
    actions.setAttach(group!.id, { shape: shape.id, kind, i: att ? Math.min(att.i, shape.pts.length - 1) : 0, t: att?.t ?? 0.5, slider, rx: att?.rx ?? 0.5, ry: att?.ry ?? 0.5 })
  }
  const change = (patch: Partial<ModelAttach>) => att && actions.setAttach(group.id, { ...att, ...patch })
  const n = target?.pts.length ?? 1

  return (
    <div className="cmTabBody">
      <section className="cmSec" aria-label="Pivot and parent">
        <h3 className="cmInsSub">Pivot and parent</h3>
        <p className="cmCrumbs" aria-label="Chain of groups">
          {chain.map((id, i) => {
            const g = content.groups.find(x => x.id === id)
            if (!g) return null
            return (
              <span key={id}>
                {i > 0 && ' › '}
                {id === group.id ? <b>{name(g)}</b> : <button type="button" className="cmLink" onClick={() => actions.selectGroup(id)}>{name(g)}</button>}
              </span>
            )
          })}
        </p>
        <p className={`cmInsText${depth > LIMITS.chainWarn ? ' cmInsText--warn' : ''}`} role="status">Level {depth} of {LIMITS.chainMax} in the pivot chain.{depth >= LIMITS.chainMax ? ' It cannot go deeper.' : ''}</p>
        <label className="cmField">
          <span>Hangs from</span>
          <select value={group.parent ?? ''} aria-label="Parent group" onChange={e => actions.reparent(group.id, e.target.value || null)}>
            <option value="">Nothing (the root)</option>
            {parents.map(g => <option key={g.id} value={g.id}>{name(g)}</option>)}
          </select>
        </label>
        {group.mirrorOf && <p className="cmInsText">A twin has no pivot or anchor of its own: it does what its original does, mirrored, from where its own parent stands.</p>}
        {!group.mirrorOf && <p className="cmInsText">{group.pivot ? `Pivot at x ${f1(group.pivot[0])}, y ${f1(group.pivot[1])}.` : 'No pivot yet: it will be the middle of the group.'} Everything in the group turns about it.</p>}
        {!group.mirrorOf && (
          <>
            <div className="cmInline">
              <button type="button" className="cmBtn cmBtn--small" onClick={() => actions.centerPivot(group.id)}>Put it in the middle of the group</button>
            </div>
            <p className="cmInsText">The cross on the canvas is the pivot: drag it, or focus it and press the arrow keys.</p>
          </>
        )}
      </section>
      <PairPanel content={content} kind="group" id={group.id} actions={pairs} />
      <FitSection content={content} object={object} picking={fitPicking} actions={fit} />
      <WearSection content={content} object={object} actions={wear} />
      <HandSection content={content} group={group} held={held} actions={hands} />
      {group.mirrorOf ? null : <>

      <section className="cmSec" aria-label="Attached to a shape">
        <h3 className="cmInsSub">Attached to a shape</h3>
        {!group.parent ? <p className="cmInsText">Hang the group from a parent first: it is fixed to one of the parent&apos;s shapes.</p> : targets.length === 0 ? (
          <p className="cmInsText">The parent group has no shape with an outline yet.</p>
        ) : (
          <>
            <div className="cmChips" role="group" aria-label="Kind of anchor">
              {KINDS.map(k => {
                const on = (att?.kind ?? 'none') === k.id
                const off = k.id === 'range' && content.ranges.length === 0
                return <button key={k.id} type="button" className={`cmChip cmChip--wide${on ? ' cmChip--on' : ''}`} aria-pressed={on} disabled={off} title={off ? 'Make a slider first (Ranges tab)' : k.hint} onClick={() => chooseKind(k.id)}>{k.name}</button>
              })}
            </div>
            <p className="cmInsText">{KINDS.find(k => k.id === (att?.kind ?? 'none'))?.hint}</p>
            {att && target && (
              <>
                <label className="cmField">
                  <span>Shape</span>
                  <select value={att.shape} aria-label="Shape it is fixed to" onChange={e => { const s = content.shapes.find(x => x.id === e.target.value); if (s) change({ shape: s.id, i: Math.min(att.i, s.pts.length - 1) }) }}>
                    {targets.map(s => <option key={s.id} value={s.id}>{s.name.trim() || 'Untitled shape'}</option>)}
                  </select>
                </label>
                <div className="cmInline">
                  <button type="button" className={`cmBtn cmBtn--small${picking ? ' cmBtn--on' : ''}`} aria-pressed={picking} onClick={() => actions.pick(!picking)}>{picking ? 'Click a shape of the parent…' : 'Pick on the canvas'}</button>
                </div>
                {att.kind === 'point' && <Stepper label="Point" value={`${att.i + 1} of ${n}`} onStep={dir => change({ i: ((att.i + dir) % n + n) % n })} />}
                {(att.kind === 'edge' || att.kind === 'range') && <Stepper label="Edge" value={`${att.i + 1} of ${n}`} onStep={dir => change({ i: ((att.i + dir) % n + n) % n })} />}
                {att.kind === 'edge' && (
                  <label className="cmField">
                    <span>Spot along the edge</span>
                    <span className="cmRange"><input type="range" min={0} max={100} step={1} value={Math.round(att.t * 100)} aria-label="Spot along the edge" onChange={e => change({ t: Number(e.target.value) / 100 })} /><output>{Math.round(att.t * 100)}%</output></span>
                  </label>
                )}
                {att.kind === 'range' && (
                  <label className="cmField">
                    <span>Slider that moves it</span>
                    <select value={att.slider ?? ''} aria-label="Slider that moves the anchor" onChange={e => change({ slider: e.target.value || null })}>
                      {content.ranges.map(r => <option key={r.id} value={r.id}>{r.name.trim() || r.id}</option>)}
                    </select>
                  </label>
                )}
                {att.kind === 'inside' && (
                  <>
                    <label className="cmField">
                      <span>Across the shape</span>
                      <span className="cmRange"><input type="range" min={0} max={100} step={1} value={Math.round(att.rx * 100)} aria-label="Across the shape" onChange={e => change({ rx: Number(e.target.value) / 100 })} /><output>{Math.round(att.rx * 100)}%</output></span>
                    </label>
                    <label className="cmField">
                      <span>Down the shape</span>
                      <span className="cmRange"><input type="range" min={0} max={100} step={1} value={Math.round(att.ry * 100)} aria-label="Down the shape" onChange={e => change({ ry: Number(e.target.value) / 100 })} /><output>{Math.round(att.ry * 100)}%</output></span>
                    </label>
                  </>
                )}
              </>
            )}
          </>
        )}
      </section>

      <section className="cmSec" aria-label="Motion">
        <h3 className="cmInsSub">Motion</h3>
        {moving.length === 0 ? <p className="cmInsText">No slider turns or scales this group. Make one in the Ranges tab.</p> : (
          <ul className="cmPlain">
            {moving.map(r => <li key={r.id}><button type="button" className="cmLink" onClick={() => actions.openSlider(r.id)}>{r.name.trim() || r.id}</button></li>)}
          </ul>
        )}
      </section>
      </>}
    </div>
  )
}
