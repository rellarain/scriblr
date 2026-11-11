import { ChevronLeftIcon, ChevronRightIcon } from '../../../icons'

// A value changed by a button each side (no typed numbers): the left lowers, the right raises, and Shift with a click moves by the larger step.
export function Stepper({ label, value, onStep, lowerOff = false, raiseOff = false, bigBy = 5 }: {
  label: string
  value: string
  onStep: (dir: -1 | 1, big: boolean) => void
  lowerOff?: boolean
  raiseOff?: boolean
  bigBy?: number   // how far Shift with a click moves it, for the tooltip
}) {
  return (
    <div className="cmStep" role="group" aria-label={label}>
      <span className="cmStepLabel">{label}</span>
      <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Lower ${label}`} title={`Lower (Shift: by ${bigBy})`} disabled={lowerOff} onClick={e => onStep(-1, e.shiftKey)}><ChevronLeftIcon size={12} /></button>
      <span className="cmStepValue" aria-live="polite">{value}</span>
      <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Raise ${label}`} title={`Raise (Shift: by ${bigBy})`} disabled={raiseOff} onClick={e => onStep(1, e.shiftKey)}><ChevronRightIcon size={12} /></button>
    </div>
  )
}
