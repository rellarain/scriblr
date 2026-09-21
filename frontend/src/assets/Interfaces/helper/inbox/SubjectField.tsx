import { useMemo, useRef, useState } from 'react'
import { PlusIcon } from '../../../icons'
import type { FeedbackChannel, TaxonomyPage } from './feedbackTypes'

const LEVELS = ['page', 'console', 'component', 'feature'] as const

// The names available at the next level of page > console > component > feature, given what is chosen so far.
function namesAt(taxonomy: TaxonomyPage[], path: string[]): string[] {
  const page = taxonomy.find(p => p.name === path[0])
  const consoleDef = page?.consoles.find(c => c.name === path[1])
  const component = consoleDef?.components.find(c => c.name === path[2])
  if (path.length === 0) return taxonomy.map(p => p.name)
  if (path.length === 1) return page?.consoles.map(c => c.name) ?? []
  if (path.length === 2) return consoleDef?.components.map(c => c.name) ?? []
  return component?.features ?? []
}

// Where a message's sender was when they wrote it, as far as it exists in the tree: the field starts there.
function startPath(taxonomy: TaxonomyPage[], start: { page?: string | null; console?: string | null; component?: string | null }): string[] {
  const path: string[] = []
  for (const name of [start.page, start.console, start.component]) {
    if (!name || !namesAt(taxonomy, path).includes(name)) break
    path.push(name)
  }
  return path
}

// One text field for choosing a subject. The levels already chosen sit as small text above it; the field is
// for the next level down and shows its suggestions below, filtered as you type. Enter or a click takes the
// highlighted (by default the top) suggestion; typing "/" takes the typed text if it matches one, clears the
// field and moves on to the next level; Backspace in an empty field steps back up a level; Escape closes the
// list. Choosing a feature adds the subject, and a plus button then offers to add another.
export function SubjectField({ taxonomy, start, disabled, onAdd }: {
  taxonomy: TaxonomyPage[]
  start: { page?: string | null; console?: string | null; component?: string | null }
  disabled: boolean
  onAdd: (channel: FeedbackChannel) => void
}) {
  const [path, setPath] = useState<string[]>(() => startPath(taxonomy, start))
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const names = useMemo(() => namesAt(taxonomy, path), [taxonomy, path])
  const query = text.trim().toLowerCase()
  const suggestions = useMemo(
    () => [...names.filter(n => n.toLowerCase().startsWith(query)), ...names.filter(n => !n.toLowerCase().startsWith(query) && n.toLowerCase().includes(query))],
    [names, query],
  )

  function choose(name: string) {
    if (path.length < 3) {
      setPath([...path, name])
      setText('')
      setActive(0)
      input.current?.focus()
      return
    }
    onAdd({ page: path[0], console: path[1], component: path[2], feature: name })
    setPath([])
    setText('')
    setActive(0)
    setOpen(false)
    setCollapsed(true)
  }

  function onChange(value: string) {
    if (value.endsWith('/')) {
      const typed = value.slice(0, -1).trim().toLowerCase()
      const exact = names.find(n => n.toLowerCase() === typed)
      const pick = exact ?? (typed ? names.find(n => n.toLowerCase().startsWith(typed)) : suggestions[active])
      if (pick && path.length < 3) { choose(pick); return }
      setText(value.slice(0, -1))
      return
    }
    setText(value)
    setActive(0)
    setOpen(true)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const pick = suggestions[active] ?? suggestions[0]
      if (pick) choose(pick)
    } else if (e.key === 'Backspace' && text === '' && path.length > 0) {
      e.preventDefault()
      setPath(path.slice(0, -1))
      setActive(0)
    } else if (e.key === 'Escape') { setOpen(false) }
  }

  if (collapsed) {
    return (
      <button
        type="button" className="subjectPlus" data-cf disabled={disabled} aria-label="Add another subject" title="Add another subject"
        onClick={() => { setCollapsed(false); window.requestAnimationFrame(() => { input.current?.focus(); setOpen(true) }) }}
      >
        <PlusIcon size={14} />
      </button>
    )
  }
  return (
    <div className="subjectField">
      {path.length > 0 && <div className="subjectPath" aria-label="Chosen so far">{path.join(' / ')}</div>}
      <input
        ref={input} className="subjectInput" data-cf disabled={disabled} value={text}
        placeholder={`Add a ${LEVELS[path.length]}…`} aria-label={`Subject ${LEVELS[path.length]}`}
        role="combobox" aria-expanded={open && suggestions.length > 0} aria-autocomplete="list" autoComplete="off"
        onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      />
      {open && suggestions.length > 0 && (
        <ul className="subjectSuggest" role="listbox" aria-label={`${LEVELS[path.length]} suggestions`}>
          {suggestions.map((name, i) => (
            <li key={name} role="option" aria-selected={i === active}>
              <button
                type="button" tabIndex={-1} className={i === active ? 'subjectOption subjectOption--active' : 'subjectOption'}
                // The input keeps its focus, so the list stays open until a choice is made.
                onMouseDown={e => e.preventDefault()} onClick={() => choose(name)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SubjectField
