import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDownIcon } from '../../../icons'
import type { Option } from './portrait/library'

// A dropdown whose choices are pictures: the button shows the chosen one (its picture and its name) and opens a grid of every choice drawn as it would be, each beside its name.
// It is a listbox: the arrow keys move over the choices (a row at a time too, when they lie in a grid), Home and End go to the first and the last, Enter or Space chooses, Escape
// closes without choosing, Tab leaves, and typing the first letters of a name goes to it. A click outside closes it. The pictures are only drawn while it is open.
export function PreviewSelect({ label, options, value, onChange, thumb, disabled = false, bare = false }: {
  label: string; options: readonly Option[]; value: string; onChange: (id: string) => void; thumb: (option: Option) => ReactNode; disabled?: boolean; bare?: boolean
}) {
  const uid = useId().replace(/[^A-Za-z0-9]/g, '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const chosen = Math.max(0, options.findIndex(o => o.id === value))
  const current = options[chosen] ?? options[0]

  const show = () => { setActive(chosen); setOpen(true) }
  const close = (back: boolean) => { setOpen(false); if (back) button.current?.focus() }

  // The list takes the focus when it opens, and keeps the active choice in view.
  useEffect(() => { if (open) list.current?.focus({ preventScroll: true }) }, [open])
  useEffect(() => {
    if (!open) return
    const el = list.current?.querySelector<HTMLElement>(`#${uid}o${active}`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active, uid])
  // A press outside closes it.
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  // How many choices lie in a row (when the list is a grid), so Up and Down move a row.
  const columns = () => {
    const tracks = list.current ? getComputedStyle(list.current).gridTemplateColumns : ''
    return tracks && tracks !== 'none' ? Math.max(1, tracks.split(' ').filter(Boolean).length) : 1
  }
  const move = (to: number) => setActive(Math.min(options.length - 1, Math.max(0, to)))
  const choose = (i: number) => { onChange(options[i].id); close(true) }

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const key = e.key
    if (key === 'ArrowDown') { e.preventDefault(); move(active + columns()) }
    else if (key === 'ArrowUp') { e.preventDefault(); move(active - columns()) }
    else if (key === 'ArrowRight') { e.preventDefault(); move(active + 1) }
    else if (key === 'ArrowLeft') { e.preventDefault(); move(active - 1) }
    else if (key === 'Home') { e.preventDefault(); move(0) }
    else if (key === 'End') { e.preventDefault(); move(options.length - 1) }
    else if (key === 'PageDown') { e.preventDefault(); move(active + 5) }
    else if (key === 'PageUp') { e.preventDefault(); move(active - 5) }
    else if (key === 'Enter' || key === ' ') { e.preventDefault(); choose(active) }
    else if (key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
    else if (key === 'Tab') close(false)
    else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing: the letters typed in quick succession name the choice to go to.
      const now = Date.now()
      const text = (now - typed.current.at > 600 ? '' : typed.current.text) + key.toLowerCase()
      typed.current = { text, at: now }
      const from = text.length === 1 ? active + 1 : active
      const found = [...options.slice(from), ...options.slice(0, from)].find(o => o.name.toLowerCase().startsWith(text))
      if (found) { e.preventDefault(); setActive(options.indexOf(found)) }
    }
  }
  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show() }
  }

  return (
    <div className="charPick" ref={root}>
      {!bare && <span className="charLabel" aria-hidden="true">{label}</span>}
      <div className="charPickBox">
        <button
          type="button" ref={button} className="charPickBtn" disabled={disabled}
          aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${uid}list` : undefined} aria-label={`${label}: ${current.name}`}
          onClick={() => (open ? close(false) : show())} onKeyDown={onButtonKey}
        >
          <span className="charPickThumb" aria-hidden="true">{thumb(current)}</span>
          <span className="charPickName">{current.name}</span>
          <ChevronDownIcon size={16} />
        </button>
        {open && (
          <ul
            ref={list} id={`${uid}list`} role="listbox" tabIndex={-1} className="charPickList" aria-label={label} aria-activedescendant={`${uid}o${active}`} onKeyDown={onListKey}
          >
            {options.map((o, i) => (
              <li
                key={o.id} id={`${uid}o${i}`} role="option" aria-selected={i === chosen} className={i === active ? 'charPickOpt charPickOpt--active' : 'charPickOpt'}
                onClick={() => choose(i)} onMouseMove={() => { if (i !== active) setActive(i) }}
              >
                <span className="charPickThumb charPickThumb--big" aria-hidden="true">{thumb(o)}</span>
                <span className="charPickName">{o.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
