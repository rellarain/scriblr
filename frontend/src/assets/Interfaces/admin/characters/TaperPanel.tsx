import { CheckIcon, HighlighterIcon, RestoreIcon, UndoIcon } from '../../../icons'
import { TAPER_MAX_WIDTH, type TaperSpec } from './engine/taper'
import { Stepper } from './Stepper'

// The Taper tool's panel (phase O3), under the Designer tools while the tool is on: the ribbon's width at its start, middle and end, the side it lies to, whether its ends come to
// a point, and the actions (make the ribbon from the line laid on the canvas, start the line over, take back its last point, or turn the selected open line into a ribbon). The
// line itself is laid on the canvas, a click per point. A ribbon is an ordinary closed shape: its outline is baked into points, so it costs no more than any other shape.
export interface TaperPanelProps {
  spec: TaperSpec
  onSpec: (next: TaperSpec) => void
  // how many points of the line are laid
  points: number
  // where the ribbon will go (the object's name), or why it cannot be made
  into: string
  onMake: () => void
  onBack: () => void
  onClear: () => void
  // the selected shape is an open line that can be tapered (its name), or why not (null: no line selected)
  line: { name: string; blocked: string | null } | null
  onTaperLine: () => void
}

const sideText = (side: number): string => (side === 0 ? 'Centred' : `${Math.round(Math.abs(side) * 100)}% to the ${side > 0 ? 'left' : 'right'}`)
const widthText = (w: number): string => `${w} units`

export function TaperPanel(p: TaperPanelProps) {
  const s = p.spec
  const width = (key: 'w0' | 'wm' | 'w1') => (dir: -1 | 1, big: boolean) => p.onSpec({ ...s, [key]: Math.min(TAPER_MAX_WIDTH, Math.max(0, Math.round((s[key] + dir * (big ? 5 : 0.5)) * 2) / 2)) })
  return (
    <div className="cmTaperBar" role="group" aria-label="Taper">
      <p className="cmPoseText" role="status">
        {p.points === 0
          ? `Click on the canvas to lay the line the ribbon runs along (up to 12 points are kept, evenly spaced). It goes into ${p.into}.`
          : p.points === 1
            ? 'One point laid: click again to lay the next.'
            : `${p.points} points laid. Press Enter or double-click to make the ribbon; Backspace takes back a point, Escape starts over.`}
      </p>
      <span className="cmInline">
        <Stepper label="Start width" value={widthText(s.w0)} onStep={width('w0')} lowerOff={s.w0 <= 0} raiseOff={s.w0 >= TAPER_MAX_WIDTH} bigBy={5} />
        <Stepper label="Middle width" value={widthText(s.wm)} onStep={width('wm')} lowerOff={s.wm <= 0} raiseOff={s.wm >= TAPER_MAX_WIDTH} bigBy={5} />
        <Stepper label="End width" value={widthText(s.w1)} onStep={width('w1')} lowerOff={s.w1 <= 0} raiseOff={s.w1 >= TAPER_MAX_WIDTH} bigBy={5} />
        <Stepper
          label="Side" value={sideText(s.side)} lowerOff={s.side <= -1} raiseOff={s.side >= 1} bigBy={1}
          onStep={(dir, big) => p.onSpec({ ...s, side: Math.min(1, Math.max(-1, Math.round((s.side + dir * (big ? 1 : 0.25)) * 4) / 4)) })}
        />
        <button
          type="button" className={`cmChip${s.pointed ? ' cmChip--on' : ''}`} aria-pressed={s.pointed} title="Pointed ends: each end of the ribbon comes to a single sharp point"
          onClick={() => p.onSpec({ ...s, pointed: !s.pointed })}
        >Pointed ends</button>
      </span>
      <span className="cmToolGroup" role="toolbar" aria-label="Taper actions">
        <button type="button" className="cmIconBtn" aria-label="Make the ribbon" title={`Make the ribbon from the line laid on the canvas (it goes into ${p.into})`} disabled={p.points < 2} onClick={p.onMake}><CheckIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Take back the last point" title="Take back the last point of the line (Backspace)" disabled={p.points === 0} onClick={p.onBack}><UndoIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Start the line over" title="Start the line over (Escape)" disabled={p.points === 0} onClick={p.onClear}><RestoreIcon size={14} /></button>
        <button
          type="button" className="cmIconBtn" aria-label="Taper this line"
          title={!p.line ? 'Taper this line: select an open line first, and it becomes a ribbon along its own path' : p.line.blocked ?? `Taper this line: ${p.line.name} becomes a ribbon along its own path`}
          disabled={!p.line || !!p.line.blocked} onClick={p.onTaperLine}
        ><HighlighterIcon size={14} /></button>
      </span>
    </div>
  )
}
