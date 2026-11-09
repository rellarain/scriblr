import { useState, type CSSProperties } from 'react'
import type { ModelContent } from '../../../../api/types'
import { ColorRange } from '../../../../components/ColorRange'
import { EyeIcon, PlusIcon, RestoreIcon, SaveIcon, TrashIcon } from '../../../icons'
import { hexHsl, hslHex } from './engine/colour'
import { framesOf, hideable } from './engine/frames'
import { LIMITS } from './engine/limits'
import type { FrameActions } from './rigActions'

// The Frames tab (phase 5a): named crops of the figure. A frame is a rectangle on the canvas that is moved and resized by dragging it (arrow keys nudge, Shift with
// the arrows resizes, Alt makes the steps five); this tab lists the frames, names them, chooses what each leaves out, looks at the figure through one, and sets the
// card colour behind the figure (a test colour that is kept as the model's starter tile on request). No sizes are typed.
export interface FramesState {
  // The frame being edited on the canvas, and the frame the canvas looks through (null: the whole figure).
  selected: string | null
  through: string | null
  // The test card colour, and whether it differs from the model's own.
  tile: string
  tileChanged: boolean
}

const label = (name: string, fallback: string) => name.trim() || fallback
const f1 = (n: number) => Math.round(n * 10) / 10

function Slide({ text, value, min, max, onChange }: { text: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="cmField">
      <span>{text} <output>{Math.round(value)}</output></span>
      <span className="cmRange"><input type="range" min={min} max={max} step={1} value={Math.min(max, Math.max(min, value))} aria-label={text} onChange={e => onChange(Number(e.target.value))} /></span>
    </label>
  )
}

export function FramesTab({ content, state, actions }: { content: ModelContent; state: FramesState; actions: FrameActions }) {
  const [confirm, setConfirm] = useState<string | null>(null)
  const frames = framesOf(content)
  const selected = frames.find(f => f.id === state.selected)
  const things = hideable(content)
  const [h, s, l] = hexHsl(state.tile)
  const setTile = (nh: number, ns: number, nl: number) => actions.setTile(hslHex(nh, ns, nl))

  return (
    <div className="cmTabBody">
      <section className="cmSec" aria-label="Frames">
        <h3 className="cmInsSub">Frames <span className={`cmCount${frames.length > LIMITS.framesWarn ? ' cmCount--warn' : ''}`}>{frames.length} of {LIMITS.framesMax}</span></h3>
        <p className="cmInsText">A frame is a crop of the figure: a bust, the face, a hand. Add one around what is on the canvas, then drag its rectangle to move it and its handles to resize it.</p>
        <div className="cmInline">
          <button type="button" className="cmBtn cmBtn--small" disabled={frames.length >= LIMITS.framesMax} onClick={actions.add}><PlusIcon size={12} /> Add a frame</button>
          <button type="button" className={`cmBtn cmBtn--small${state.through === null ? ' cmBtn--on' : ''}`} aria-pressed={state.through === null} onClick={() => actions.through(null)}>Whole figure</button>
        </div>
        {frames.length === 0 && <p className="cmInsText">No frame yet.</p>}
        {frames.map(f => {
          const name = label(f.name, 'Frame')
          return (
            <section key={f.id} className="cmSlider" aria-label={`Frame ${name}`}>
              <div className="cmSliderHead">
                <input className="cmSliderName" aria-label={`Name of frame ${name}`} value={f.name} maxLength={40} placeholder="Name" onChange={e => actions.rename(f.id, e.target.value)} />
                {confirm === f.id ? (
                  <span className="cmConfirm" role="group" aria-label={`Delete ${name}?`}>
                    <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirm(null); actions.remove(f.id) }}>Delete it</button>
                    <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirm(null)}>Keep it</button>
                  </span>
                ) : <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete frame ${name}`} title="Delete the frame" onClick={() => setConfirm(f.id)}><TrashIcon size={12} /></button>}
              </div>
              <div className="cmChips" role="group" aria-label={`${name}`}>
                <button type="button" className={`cmChip cmChip--wide${state.selected === f.id ? ' cmChip--on' : ''}`} aria-pressed={state.selected === f.id} title="Show its rectangle on the canvas to move and resize it" onClick={() => actions.select(state.selected === f.id ? null : f.id)}>Edit on the canvas</button>
                <button type="button" className={`cmChip cmChip--wide${state.through === f.id ? ' cmChip--on' : ''}`} aria-pressed={state.through === f.id} title="Look at the figure through this frame" onClick={() => actions.through(state.through === f.id ? null : f.id)}><EyeIcon size={12} /> View through</button>
              </div>
              <p className="cmInsText cmMeasure">x {f1(f.x)}, y {f1(f.y)}, {f1(f.w)} wide, {f1(f.h)} tall{f.hide.length ? `, leaves out ${f.hide.length}` : ''}</p>
            </section>
          )
        })}
      </section>

      {selected && (
        <section className="cmSec" aria-label={`What ${label(selected.name, 'the frame')} leaves out`}>
          <h3 className="cmInsSub">Leaves out</h3>
          <p className="cmInsText">Groups and objects the figure is seen without when looked at through this frame (a bust leaves out the legs).</p>
          <div className="cmChips" role="group" aria-label="Groups and objects left out of the frame">
            {things.map(t => {
              const on = selected.hide.includes(t.id)
              return <button key={t.id} type="button" className={`cmChip cmChip--wide${on ? ' cmChip--on' : ''}`} aria-pressed={on} title={`${t.kind === 'group' ? 'Group' : 'Object'} ${t.name}`} onClick={() => actions.toggleHide(selected.id, t.id)}>{t.name}</button>
            })}
          </div>
          <p className="cmInsText">Drag the rectangle on the canvas to move it. Its handles resize it. With the rectangle focused, the arrow keys nudge it by 1 (Alt: 5); with Shift they resize it.</p>
        </section>
      )}

      <section className="cmSec" aria-label="Card colour">
        <h3 className="cmInsSub">Card colour</h3>
        <p className="cmInsText">The colour of the card behind the figure when it is seen through a frame. This one is only for looking; keep it to make it the colour new characters start with.</p>
        <span className="cmTilePreview" style={{ '--tile': state.tile } as CSSProperties} role="img" aria-label={`Card colour ${state.tile}`} />
        <ColorRange label="Hue of the card" value={h} min={0} max={359} sat={Math.max(s, 20)} light={Math.min(Math.max(l, 25), 75)} onChange={v => setTile(v, s, l)} />
        <Slide text="Saturation of the card" value={s} min={0} max={100} onChange={v => setTile(h, v, l)} />
        <Slide text="Lightness of the card" value={l} min={0} max={100} onChange={v => setTile(h, s, v)} />
        <div className="cmInline">
          <button type="button" className="cmBtn cmBtn--small" disabled={!state.tileChanged} title="Keep this colour as the one new characters start with" onClick={actions.useTile}><SaveIcon size={12} /> Use as the starter card colour</button>
          <button type="button" className="cmBtn cmBtn--small" disabled={!state.tileChanged} title="Put the test colour back to the starter colour" onClick={actions.resetTile}><RestoreIcon size={12} /> Start over from the starter colour</button>
        </div>
      </section>
    </div>
  )
}
