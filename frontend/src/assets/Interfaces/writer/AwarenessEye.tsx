import type { Awareness } from '../../../api/types'
import { EyeClosedIcon, EyeForwardIcon, EyeLeftIcon, EyeRightIcon } from '../../icons'
import { AWARENESS_LABEL, awarenessTitle } from './awareness'

// The eye of a plotpoint placed on a moment. Its look says who knows of the
// plotpoint (forward: everyone, left: the audience, right: the characters,
// closed: no one); clicking steps to the next state. `onCycle` left out makes
// it a read-only indicator.
const ICON: Record<Awareness, typeof EyeForwardIcon> = {
  front: EyeForwardIcon, back: EyeLeftIcon, mid: EyeRightIcon, off: EyeClosedIcon,
}

export function AwarenessEye({ state, onCycle, size = 16 }: { state: Awareness; onCycle?: () => void; size?: number }) {
  const Icon = ICON[state]
  if (!onCycle) {
    return <span className="wrEye wrEye--static" title={awarenessTitle(state).replace(' Click to change.', '')} aria-label={AWARENESS_LABEL[state]}><Icon size={size} /></span>
  }
  return (
    <button
      type="button" className="wrEye" data-awareness={state} aria-label={`${AWARENESS_LABEL[state]}. Change awareness`}
      title={awarenessTitle(state)} onClick={e => { e.stopPropagation(); onCycle() }}
    >
      <Icon size={size} />
    </button>
  )
}

export default AwarenessEye

// A small key to the four eyes, shown with the chapter's plotpoint tiles.
export function AwarenessLegend() {
  const states: Awareness[] = ['front', 'back', 'mid', 'off']
  return (
    <ul className="wrEyeLegend" aria-label="What the eye means">
      {states.map(state => (
        <li key={state} title={awarenessTitle(state).replace(' Click to change.', '')}>
          <AwarenessEye state={state} size={14} />
          <span>{AWARENESS_LABEL[state]}</span>
        </li>
      ))}
    </ul>
  )
}
