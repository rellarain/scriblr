import type { ModelRange } from '../../../../api/types'
import { RestoreIcon } from '../../../icons'
import { Stepper } from './Stepper'
import { valueText } from './rigView'

// The span a writer may choose a slider within (phase 5a): two steppers inside the slider's own range, and a button that lets them choose anywhere again. The
// slider's resting value is always allowed, so the steppers stop there. Shown for a slider that is offered to writers, in the Ranges and Proportions tabs.
export function LimitSteppers({ range, onStep, onClear }: {
  range: ModelRange
  onStep: (end: 'lo' | 'hi', dir: -1 | 1, big: boolean) => void
  onClear: () => void
}) {
  const title = range.name.trim() || 'Slider'
  const [lo, hi] = range.limit ?? [range.min, range.max]
  return (
    <div className="cmLimit" role="group" aria-label={`What a writer may choose for ${title}`}>
      <Stepper label={`Writer's smallest of ${title}`} value={valueText(range, lo)} onStep={(dir, big) => onStep('lo', dir, big)} lowerOff={lo <= range.min} raiseOff={lo >= range.rest} />
      <Stepper label={`Writer's largest of ${title}`} value={valueText(range, hi)} onStep={(dir, big) => onStep('hi', dir, big)} lowerOff={hi <= range.rest} raiseOff={hi >= range.max} />
      <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Let writers choose anywhere on ${title}`} title="Let writers choose anywhere on the slider" disabled={!range.limit} onClick={onClear}><RestoreIcon size={12} /></button>
    </div>
  )
}
