import type { ReactNode } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '../../../icons'

// A section that folds: its title (with a short summary beside it while folded) is the button that opens it. Used by the shift panel and the Analytics tile.
export function Fold({ title, summary, open, onToggle, children }: { title: string; summary?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="wrFold" aria-label={title}>
      <button type="button" className="wrFoldHead" aria-expanded={open} onClick={onToggle}>
        {open ? <ChevronDownIcon size={20} /> : <ChevronRightIcon size={20} />}
        <span>{title}</span>
        {summary && !open && <small>{summary}</small>}
      </button>
      {open && <div className="wrFoldBody">{children}</div>}
    </section>
  )
}
