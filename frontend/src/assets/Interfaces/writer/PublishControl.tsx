import { useState } from 'react'
import { ExportIcon } from '../../icons'

// The chapter's Publish button. It asks first ("Publish this chapter?"), like
// the delete and restore confirmations; nothing is sent anywhere yet, each
// publication is a dated copy of the draft kept for the author (see Preview).
export function PublishControl({ disabled, busy, title, onPublish }: {
  disabled: boolean
  busy: boolean
  title: string
  onPublish: () => void | Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <span className="wrPublishConfirm" role="alertdialog" aria-label="Publish this chapter">
        <span>Publish this chapter?</span>
        <button
          type="button" className="wrSmallBtn wrSmallBtn--accent" disabled={busy}
          onClick={() => { void Promise.resolve(onPublish()).finally(() => setConfirming(false)) }}
        >
          {busy ? 'Publishing…' : 'Publish'}
        </button>
        <button type="button" className="wrSmallBtn" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
      </span>
    )
  }
  return (
    <button type="button" className="wrSmallBtn" disabled={disabled || busy} title={title} aria-label="Publish chapter" onClick={() => setConfirming(true)}>
      <ExportIcon size={14} /> Publish
    </button>
  )
}
