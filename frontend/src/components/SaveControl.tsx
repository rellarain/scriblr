import { useEffect, useState, type ReactNode } from 'react'
import { RestoreIcon, SaveIcon } from '../assets/icons'
import type { SaveStatus } from '../lib/useAutosave'
import './saveControl.scss'

// The hour and minute of a save, e.g. "3:42 PM".
export function formatSaveTime(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// A restore icon and a floppy-disk Save button, joined as one control. The save state is a dot on
// the Save button (amber while changes wait or are being saved, red when a save failed) and its text
// shows only while the pointer is over the button. The state text is
// "Unsaved changes" while an edit is waiting, "Saving…", "Save failed" (the
// error is its tooltip), or, once everything is saved, the time of the last
// save (manual or automatic). Whether editors autosave, and how long they wait,
// is the user's choice (UUI Account > Settings); the button saves right now.
// The restore icon (when `onRestore` is given) throws away the unsaved changes
// and goes back to the last saved version, after a confirmation. `label` names
// the Save button for screen readers and its tooltip. `extra` is a slot for a
// Publish button where an editor has one. `buttonClassName` lets each
// interface use its own button style.
export function SaveControl({ status, onSave, onRestore, label = 'Save', buttonClassName = 'saveBtn', extra }: {
  status: SaveStatus
  onSave: () => void
  onRestore?: () => void | Promise<void>
  label?: string
  buttonClassName?: string
  extra?: ReactNode
}) {
  const [confirming, setConfirming] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const saved = status.state === 'saved'
  const busy = status.state === 'saving' || restoring

  // Nothing left to discard (it saved meanwhile): drop the question.
  useEffect(() => { if (!status.dirty) setConfirming(false) }, [status.dirty])

  async function restore() {
    if (!onRestore) return
    setRestoring(true)
    try { await onRestore() } finally { setRestoring(false); setConfirming(false) }
  }

  const text = status.state === 'error' ? 'Save failed'
    : status.state === 'saving' ? 'Saving…'
    : status.state === 'unsaved' ? 'Unsaved changes'
    : status.lastSavedAt !== null ? formatSaveTime(status.lastSavedAt)
    : '—'
  const title = status.error
    ?? (saved ? (status.lastSavedAt !== null ? `Last saved at ${formatSaveTime(status.lastSavedAt)}` : 'No changes saved yet') : undefined)

  if (confirming) {
    return (
      <span className="saveControl saveControl--confirm" role="alertdialog" aria-label="Restore the last saved version">
        <span className="saveState saveState--unsaved">Discard unsaved changes?</span>
        <button type="button" className={`${buttonClassName} saveConfirmBtn`} disabled={restoring} onClick={() => { void restore() }}>
          Restore
        </button>
        <button type="button" className={`${buttonClassName} saveConfirmBtn saveConfirmBtn--quiet`} disabled={restoring} onClick={() => setConfirming(false)}>
          Keep editing
        </button>
      </span>
    )
  }

  return (
    <span className="saveControl">
      {onRestore && (
        <button
          type="button" className={`${buttonClassName} saveIconBtn saveRestoreBtn`}
          aria-label="Restore last saved version" title={status.dirty ? 'Restore the last saved version' : 'Nothing to restore: no unsaved changes'}
          disabled={!status.dirty || busy}
          onClick={() => setConfirming(true)}
        >
          <RestoreIcon size={16} />
        </button>
      )}
      {/* The save state (or the time of the last save) shows only while the pointer is over the Save button. */}
      <span className="saveHover">
        <span className={`saveState saveState--${status.state}`} role="status" title={title}>{text}</span>
        <button
          type="button" className={`${buttonClassName} saveIconBtn saveBtnState saveBtnState--${status.state}`} aria-label={label} title={label}
          disabled={saved || busy}
          onClick={onSave}
        >
          <SaveIcon size={16} />
        </button>
      </span>
      {extra}
    </span>
  )
}

export default SaveControl
