import { CopyIcon, RestoreIcon, SparkleIcon, SwapIcon, ToningIcon, TrashIcon } from '../../../icons'
import { Stepper } from './Stepper'

// The Skin tool's panel (phase O1), under the Designer tools while the tool is on: which group the selected shape's points follow, how strongly and how widely a drag paints,
// the actions (Auto across the joint, Smooth, Mirror to the other side, Copy from the shape under it, Clear), and a slider to try the bend with. The weights themselves are
// painted on the canvas: a click on a point steps it, a drag paints the points near the pointer.
export interface SkinPanelProps {
  shapeName: string
  // why the weights cannot be painted (a twin, the back view, a form), or null
  blocked: string | null
  partners: Array<{ id: string; name: string; followed: boolean }>
  partner: string | null
  onPartner: (id: string) => void
  // how many points follow the partner, and the most a shape may follow
  following: number
  strength: number
  onStrength: (dir: -1 | 1, big: boolean) => void
  radius: number
  onRadius: (dir: -1 | 1, big: boolean) => void
  // the slider that bends the joint between the two groups (null: none, or the two are not on one chain)
  bend: { name: string; value: string; atRest: boolean; atMin: boolean; atMax: boolean; onStep: (dir: -1 | 1, big: boolean) => void; onRest: () => void } | null
  picking: boolean
  onAuto: () => void
  onSmooth: () => void
  onMirror: () => void
  onCopy: () => void
  onClear: () => void
  canClear: boolean
}

export function SkinPanel(p: SkinPanelProps) {
  const name = p.shapeName || 'this shape'
  const partnerName = p.partners.find(x => x.id === p.partner)?.name ?? 'another group'
  const off = !!p.blocked || !p.partner
  return (
    <div className="cmSkinBar" role="group" aria-label="Skin weights">
      <p className="cmPoseText" role="status">
        {p.blocked ?? (p.partner
          ? `${p.following ? `${p.following} point${p.following === 1 ? '' : 's'} of ${name} follow ${partnerName}` : `No point of ${name} follows ${partnerName} yet`}. Click a point to raise its weight a tenth (Shift: lower it), or drag to paint the points near the pointer.`
          : `${name} is the only group's: there is no other group to follow.`)}
      </p>
      {!p.blocked && (
        <>
          <label className="cmField cmField--inline">
            <span>Follows</span>
            <select value={p.partner ?? ''} disabled={p.partners.length === 0} onChange={e => p.onPartner(e.target.value)}>
              {p.partners.map(g => <option key={g.id} value={g.id}>{g.followed ? `${g.name} (followed)` : g.name}</option>)}
            </select>
          </label>
          <span className="cmInline">
            <Stepper label="Strength" value={`${Math.round(p.strength * 100)}%`} onStep={p.onStrength} lowerOff={p.strength <= 0} raiseOff={p.strength >= 1} bigBy={50} />
            <Stepper label="Radius" value={`${p.radius} units`} onStep={p.onRadius} lowerOff={p.radius <= 1} raiseOff={p.radius >= 60} bigBy={10} />
          </span>
          <span className="cmToolGroup" role="toolbar" aria-label="Skin weight actions">
            <button type="button" className="cmIconBtn" aria-label="Auto" title="Auto: weights that rise across the joint, over twice the radius" disabled={off} onClick={p.onAuto}><SparkleIcon size={14} /></button>
            <button type="button" className="cmIconBtn" aria-label="Smooth" title="Smooth: ease each weight toward its neighbours" disabled={off} onClick={p.onSmooth}><ToningIcon size={14} /></button>
            <button type="button" className="cmIconBtn" aria-label="Mirror" title="Mirror: copy the weights on the side of the selected point to the other side (for the twin group, when there is one)" disabled={off} onClick={p.onMirror}><SwapIcon size={14} /></button>
            <button type="button" className={`cmIconBtn${p.picking ? ' cmIconBtn--on' : ''}`} aria-label="Copy from a shape" title="Copy from a shape: click the shape under this one to take its weights (a sleeve from an arm)" aria-pressed={p.picking} onClick={p.onCopy}><CopyIcon size={14} /></button>
            <button type="button" className="cmIconBtn" aria-label="Clear" title={`Clear: take away the weights for ${partnerName}`} disabled={off || !p.canClear} onClick={p.onClear}><TrashIcon size={14} /></button>
          </span>
          {p.bend && (
            <span className="cmInline">
              <Stepper label={`Try the bend (${p.bend.name})`} value={p.bend.value} onStep={p.bend.onStep} lowerOff={p.bend.atMin} raiseOff={p.bend.atMax} bigBy={30} />
              <button type="button" className="cmIconBtn" aria-label="Back to rest" title="Put the bend back at rest" disabled={p.bend.atRest} onClick={p.bend.onRest}><RestoreIcon size={14} /></button>
            </span>
          )}
        </>
      )}
    </div>
  )
}
