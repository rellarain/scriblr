import type { ModelContent, ModelFit, ModelObject } from '../../../../api/types'
import { FIT_MODES, FIT_NAMES, fitOf, stretchTargets } from './engine/fitEdit'
import type { FitActions } from './rigActions'

// How the selected object fits the body (phase 5a), in the Rig tab: it scales with its group (the default), keeps its own size, or stretches to follow the box of
// another shape (a hat to the head, a shirt to the torso). Only how it is drawn changes: anchors and links read the outline as the group holds it.
const HINTS: Record<ModelFit, string> = {
  scale: 'It moves, turns and scales with its group.',
  keep: 'It moves and turns with its group but keeps its own size, whatever scales the group or the groups above it.',
  stretch: 'It grows and moves as the box of the shape it follows does. It does not turn with it.',
}

export function FitSection({ content, object, picking, actions }: { content: ModelContent; object: ModelObject | undefined; picking: boolean; actions: FitActions }) {
  if (!object) return <section className="cmSec" aria-label="How it fits the body"><h3 className="cmInsSub">How it fits the body</h3><p className="cmInsText">Select an object to choose how it fits the body.</p></section>
  const name = object.name.trim() || 'the object'
  if (object.mirrorOf) {
    return <section className="cmSec" aria-label="How it fits the body"><h3 className="cmInsSub">How it fits the body</h3><p className="cmInsText">{name} is a twin: it fits the body as its original does.</p></section>
  }
  const mode = fitOf(object)
  const targets = stretchTargets(content, object.id).map(id => content.shapes.find(s => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s)
  return (
    <section className="cmSec" aria-label="How it fits the body">
      <h3 className="cmInsSub">How it fits the body</h3>
      <div className="cmChips" role="group" aria-label={`How ${name} fits the body`}>
        {FIT_MODES.map(m => (
          <button key={m} type="button" className={`cmChip cmChip--wide${mode === m ? ' cmChip--on' : ''}`} aria-pressed={mode === m} title={HINTS[m]} disabled={m === 'stretch' && targets.length === 0} onClick={() => mode !== m && actions.setFit(object.id, m)}>{FIT_NAMES[m]}</button>
        ))}
      </div>
      <p className="cmInsText">{HINTS[mode]}</p>
      {mode === 'stretch' && (
        <>
          <label className="cmField">
            <span>Follows the box of</span>
            <select value={object.fitTo ?? ''} aria-label={`The shape ${name} stretches to`} onChange={e => actions.setFit(object.id, 'stretch', e.target.value || null)}>
              <option value="">Nothing chosen</option>
              {object.fitTo && !targets.some(s => s.id === object.fitTo) && <option value={object.fitTo}>(gone)</option>}
              {targets.map(s => <option key={s.id} value={s.id}>{s.name.trim() || 'Untitled shape'}</option>)}
            </select>
          </label>
          <div className="cmInline">
            <button type="button" className={`cmBtn cmBtn--small${picking ? ' cmBtn--on' : ''}`} aria-pressed={picking} onClick={() => actions.pick(!picking)}>{picking ? 'Click a shape…' : 'Pick on the canvas'}</button>
          </div>
        </>
      )}
    </section>
  )
}
