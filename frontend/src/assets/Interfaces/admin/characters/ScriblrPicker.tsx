import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getPublishedModels } from '../../../../api/characterModelsApi'
import type { ModelContent, PublishedModelOut } from '../../../../api/types'
import { MannequinIcon } from '../../../icons'

// A button that opens the list of the models Scriblr ships and the admin has published (read when it opens); picking one calls onPick with a copy of its content, for the writer's
// own library to keep as a draft of its own. The original is never touched. Escape and a click outside close it.
export function ScriblrPicker({ onPick, button, buttonClassName = 'cmIconBtn cmIconBtn--small' }: {
  onPick: (content: ModelContent, from: PublishedModelOut) => void
  // What the button shows (an icon by default) and its classes.
  button?: ReactNode
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<PublishedModelOut[] | null>(null)
  const [problem, setProblem] = useState('')
  const root = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    setProblem('')
    getPublishedModels()
      .then(r => { if (live) setModels(Array.isArray(r.models) ? r.models : []) })
      .catch(() => { if (live) { setModels([]); setProblem("Scriblr's models could not be loaded.") } })
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { live = false; document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const label = 'Duplicate a Scriblr model'
  return (
    <span className="cmMenuAnchor" ref={root}>
      <button type="button" className={buttonClassName} aria-label={button ? undefined : label} title="Make a copy of a model that comes with Scriblr, to change as your own" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {button ?? <MannequinIcon size={12} />}
      </button>
      {open && (
        <div className="cmMenu cmMenu--list" role="menu" aria-label="Scriblr's models">
          {models === null && <p className="cmInsText" role="status">Looking for models…</p>}
          {problem && <p className="cmInsText" role="alert">{problem}</p>}
          {models !== null && models.length === 0 && !problem && <p className="cmInsText">Scriblr has no published model to copy.</p>}
          {(models ?? []).map(m => (
            <button key={m.id} type="button" role="menuitem" className="cmMenuBtn" onClick={() => { setOpen(false); onPick(structuredClone(m.content), m) }}>
              {m.content.name || m.id}
              <small>{m.content.shapes.length} shapes · version {m.version}</small>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
