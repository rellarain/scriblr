import type { CSSProperties } from 'react'
import { AUTOSAVE_SECONDS, type AutosaveMode } from '../theme/types'
import './saveControl.scss'

// The autosave choice: Off, or save after 1, 5 or 10 minutes without a change. Shared by the Save component's popover and Account > Settings.
export const AUTOSAVE_MODES: readonly AutosaveMode[] = [0, ...AUTOSAVE_SECONDS]

export function autosaveLabel(mode: AutosaveMode): string {
  return mode === 0 ? 'Off' : `${mode / 60} min`
}

export function AutosaveToggle({ mode, onChange, className }: { mode: AutosaveMode; onChange: (mode: AutosaveMode) => void; className?: string }) {
  return (
    <div className={className ? `autosaveToggle ${className}` : 'autosaveToggle'} role="radiogroup" aria-label="Autosave">
      <span className="autosaveToggleLabel">Autosave</span>
      {AUTOSAVE_MODES.map(m => (
        <button
          key={m} type="button" role="radio" aria-checked={mode === m}
          className={mode === m ? 'autosaveOpt autosaveOpt--on' : 'autosaveOpt'}
          title={m === 0 ? 'Save only when I press Save' : `Save after ${m / 60} ${m === 60 ? 'minute' : 'minutes'} without changes`}
          onClick={() => onChange(m)}
        >
          {autosaveLabel(m)}
        </button>
      ))}
    </div>
  )
}

// The autosave timer once autosave is on: a 4px by 24px vertical pill. It is full while input goes on (or nothing is unsaved), starts to deplete
// when input stops, refills on the next edit (a new `nextSaveAt` restarts it) and empties as the save lands.
export function AutosavePill({ mode, nextSaveAt, wait }: { mode: AutosaveMode; nextSaveAt: number | null; wait: number | null }) {
  if (mode === 0) return null
  const total = wait ?? mode * 1000
  const remaining = nextSaveAt === null ? total : Math.max(0, Math.min(total, nextSaveAt - Date.now()))
  const running = nextSaveAt !== null
  const style = running
    ? ({ animationDuration: `${total}ms`, animationDelay: `-${total - remaining}ms` } as CSSProperties)
    : undefined
  return (
    <span
      className={running ? 'autosavePill autosavePill--running' : 'autosavePill'}
      role="timer" aria-label={running ? `Autosaving in ${Math.max(1, Math.round(remaining / 1000))} seconds` : `Autosave every ${mode / 60} min, nothing waiting`}
    >
      <span key={nextSaveAt ?? 'idle'} className="autosavePillFill" style={style} />
    </span>
  )
}
