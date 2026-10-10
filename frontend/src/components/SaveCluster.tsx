import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RedoIcon, SaveIcon, UndoIcon } from '../assets/icons'
import type { SaveStatus } from '../lib/useAutosave'
import type { AutosaveMode } from '../theme/types'
import { AutosavePill, AutosaveToggle } from './AutosaveToggle'
import './saveControl.scss'

// The hour and minute of a save, e.g. "3:42 PM".
export function formatSaveTime(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export interface SaveHistory {
  // Something to undo: an unsaved edit, or a change in today's activity log.
  canUndo: boolean
  // Only after an Undo; the next change takes it away.
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export interface SaveAutosave {
  mode: AutosaveMode
  onChange: (mode: AutosaveMode) => void
  // When the waiting changes save on their own, and the wait (the countdown pill).
  nextSaveAt: number | null
  wait: number | null
}

const LONG_PRESS_MS = 500

// One component for Undo, Redo, Save and Autosave, in a rounded container. Only what applies shows:
//  - saved, nothing to undo: the disabled Save button, and, while it is hovered, focused or held, the time of the last save inside it,
//    left of the icon (the only text; there is no state text, bubble or dot: Save is enabled while something is unsaved, and a failed save
//    rings it in the alert colour, its reason in the tooltip);
//  - a change to undo (an unsaved edit, or one in today's activity log): the Undo button beside it;
//  - after an Undo: Save is enabled and Redo appears; a new change takes Redo away again.
// Hovering (or focusing, or pressing and holding on touch) the Save button reveals the autosave toggle (Off / 1 / 5 / 10 min); once autosave
// is on it is a 4px by 24px vertical pill that empties as the save approaches. Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y, and Ctrl+S work while the
// pointer or focus was last in this component's level (text fields keep the browser's own undo). `extra` is a slot (a Publish button).
export function SaveCluster({ status, onSave, history, autosave, label = 'Save', buttonClassName = 'saveBtn', extra, scope }: {
  status: SaveStatus
  onSave: () => void
  history?: SaveHistory
  autosave?: SaveAutosave
  label?: string
  buttonClassName?: string
  extra?: ReactNode
  // The element whose pointer or focus makes the shortcuts apply here (the closest level by default).
  scope?: string
}) {
  const root = useRef<HTMLSpanElement | null>(null)
  const [pinned, setPinned] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)
  const saved = status.state === 'saved'
  const busy = status.state === 'saving'

  // The only text is the time of the last save, shown while the Save button is hovered, focused or held (none before the first save).
  const time = status.lastSavedAt !== null ? formatSaveTime(status.lastSavedAt) : null
  const title = status.error
    ?? (status.lastSavedAt !== null ? `Last saved at ${time}` : saved ? 'No changes saved yet' : undefined)

  // The shortcuts act on the last component the pointer or focus was in (several levels are on screen at once).
  const latest = useRef({ status, onSave, history })
  latest.current = { status, onSave, history }
  useEffect(() => {
    let active = false
    const inScope = (target: EventTarget | null) => {
      const el = root.current
      if (!el || !(target instanceof Node)) return false
      const area = (scope ? el.closest(scope) : el.closest('[data-level], .customize, .themeSettings')) ?? el.parentElement
      return area?.contains(target) ?? false
    }
    const mark = (e: Event) => { active = inScope(e.target) }
    const onKey = (e: KeyboardEvent) => {
      if (!active || !(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))
      const { status: st, onSave: save, history: h } = latest.current
      if (key === 's') {
        e.preventDefault()
        if (st.state !== 'saved' && st.state !== 'saving') save()
      } else if (!typing && key === 'z' && !e.shiftKey && h?.canUndo) {
        e.preventDefault()
        h.onUndo()
      } else if (!typing && ((key === 'z' && e.shiftKey) || key === 'y') && h?.canRedo) {
        e.preventDefault()
        h.onRedo()
      }
    }
    document.addEventListener('pointerdown', mark, true)
    document.addEventListener('focusin', mark, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', mark, true)
      document.removeEventListener('focusin', mark, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [scope])

  // A long press on the Save button (touch) opens the autosave toggle; a tap still saves. Pressing elsewhere, or Escape, closes it.
  useEffect(() => {
    if (!pinned) return
    const away = (e: Event) => { if (!root.current?.contains(e.target as Node)) setPinned(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPinned(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [pinned])
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current) }, [])

  const startHold = () => {
    if (!autosave) return
    held.current = false
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => { held.current = true; setPinned(true) }, LONG_PRESS_MS)
  }
  const endHold = () => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null } }

  return (
    <span className="saveCluster" ref={root}>
      {history?.canUndo && (
        <button type="button" className={`${buttonClassName} saveIconBtn saveUndoBtn`} aria-label="Undo" title="Undo (Ctrl+Z)" onClick={history.onUndo}>
          <UndoIcon size={16} />
        </button>
      )}
      {history?.canRedo && (
        <button type="button" className={`${buttonClassName} saveIconBtn saveRedoBtn`} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={history.onRedo}>
          <RedoIcon size={16} />
        </button>
      )}
      <span
        className={pinned ? 'saveReveal saveReveal--open' : 'saveReveal'}
        onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
      >
        <button
          type="button" className={`${buttonClassName} saveIconBtn saveBtnWithTime saveBtnState saveBtnState--${status.state}`} aria-label={label}
          title={title ?? (autosave ? `${label} (Ctrl+S). Hover for autosave.` : `${label} (Ctrl+S)`)}
          disabled={saved || busy}
          onClick={() => { if (held.current) { held.current = false; return } onSave() }}
        >
          {time !== null && <span className="saveTime" role="status">{time}</span>}
          <SaveIcon size={16} />
        </button>
        {autosave && (
          <>
            <AutosavePill mode={autosave.mode} nextSaveAt={autosave.nextSaveAt} wait={autosave.wait} />
            <span className="autosavePop"><AutosaveToggle mode={autosave.mode} onChange={autosave.onChange} /></span>
          </>
        )}
      </span>
      {extra}
    </span>
  )
}

export default SaveCluster
