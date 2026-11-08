import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PlusIcon } from '../../../icons'
import { TEMPLATES, templateBox, templatePoints } from './engine/templates'
import { shapePath } from './engine/svgText'

// A button that opens the list of template shapes (each drawn small); picking one calls onPick with its id. Used to add a shape and to put another
// template on the selected one. Escape and a click outside close it.
function Thumb({ id }: { id: string }) {
  const d = shapePath({ pts: templatePoints(id, templateBox(id, 50, 50, 36)), closed: true })
  return <svg className="cmTplThumb" viewBox="0 0 100 100" aria-hidden="true"><path d={d} /></svg>
}

export function TemplateMenu({ label, title, onPick, icon, disabled }: { label: string; title?: string; onPick: (templateId: string) => void; icon?: ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <span className="cmMenuAnchor" ref={root}>
      <button type="button" className="cmIconBtn" aria-label={label} title={title ?? label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(o => !o)}>
        {icon ?? <PlusIcon size={14} />}
      </button>
      {open && (
        <div className="cmMenu cmMenu--templates" role="menu" aria-label="Template shapes">
          {TEMPLATES.map(t => (
            <button key={t.id} type="button" role="menuitem" className="cmTpl" onClick={() => { setOpen(false); onPick(t.id) }}>
              <Thumb id={t.id} />
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
