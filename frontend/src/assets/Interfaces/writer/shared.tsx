import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { PlusIcon, TrashIcon } from '../../icons'
import type { OutlineNode } from '../../../api/types'
import { HELP_COMPONENT, SETTINGS_COMPONENT, type ComponentDef } from './consoleDefs'

export { useStoredState } from './storage'

// The vertical icon column at the left of a console: one icon per
// component, with Settings and Help pinned to the bottom.
export function IconColumn({ components, active, onSelect }: {
  components: ComponentDef[]
  active: string
  onSelect: (key: string) => void
}) {
  const button = (c: ComponentDef) => (
    <button
      key={c.key} type="button"
      className={c.key === active ? 'wrIconBtn wrIconBtn--active' : 'wrIconBtn'}
      aria-label={c.label} title={c.label} aria-pressed={c.key === active}
      onClick={() => onSelect(c.key)}
    >
      <c.Icon size={20} />
    </button>
  )
  return (
    <nav className="wrIconColumn" aria-label="Console components">
      {components.map(button)}
      <div className="wrIconColumnTail">
        {[HELP_COMPONENT, SETTINGS_COMPONENT].map(button)}
      </div>
    </nav>
  )
}

export function ConsoleTitleRow({ console: consoleName, component, right }: {
  console: string
  component: string
  right?: ReactNode
}) {
  return (
    <div className="wrTitleRow">
      <h1 className="wrConsoleTitle">{consoleName}</h1>
      <span className="wrComponentName">{component}</span>
      {right && <div className="wrTitleRight">{right}</div>}
    </div>
  )
}

export function Placeholder({ title, body }: { title: string; body?: string }) {
  return (
    <div className="wrPlaceholder">
      <h2>{title}</h2>
      <p>{body ?? 'Not built yet.'}</p>
    </div>
  )
}

// A small, quiet trash button that asks for confirmation before deleting --
// the message and Confirm/Cancel replace it in place, so it always sits
// where the trash icon was (the bottom right of its card).
export function DeleteControl({ message, onConfirm, tone = 'light' }: {
  message: string
  onConfirm: () => void
  tone?: 'light' | 'dark'
}) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
    return (
      <span className={`wrConfirm wrConfirm--${tone}`}>
        <span className="wrConfirmText">{message}</span>
        <button type="button" className="wrSmallBtn wrSmallBtn--accent" onClick={() => { setConfirming(false); onConfirm() }}>Confirm</button>
        <button type="button" className="wrSmallBtn" onClick={() => setConfirming(false)}>Cancel</button>
      </span>
    )
  }
  return (
    <button
      type="button" className={`wrTrashBtn wrTrashBtn--${tone}`}
      aria-label="Delete" title="Delete" onClick={() => setConfirming(true)}
    >
      <TrashIcon size={14} />
    </button>
  )
}

// The vertical column of chapter-number tabs on a book/page's right edge.
export function ChapterTabs({ chapters, activeId, onSelect, onAdd, variant }: {
  chapters: OutlineNode[]
  activeId: string | null
  onSelect: (chapterId: string) => void
  onAdd?: () => void
  variant: 'page' | 'cover'
}) {
  return (
    <nav className={`wrChapterTabs wrChapterTabs--${variant}`} aria-label="Chapters">
      {chapters.map((c, i) => (
        <button
          key={c.id} type="button"
          className={c.id === activeId ? 'wrChapterTab wrChapterTab--active' : 'wrChapterTab'}
          aria-label={`Chapter ${i + 1}: ${c.title}`} title={`${i + 1} · ${c.title}`}
          aria-pressed={c.id === activeId}
          onClick={() => onSelect(c.id)}
        >
          {i + 1}
        </button>
      ))}
      {onAdd && (
        <button type="button" className="wrChapterTab wrChapterTab--add" aria-label="Add chapter" title="Add chapter" onClick={onAdd}>
          <PlusIcon size={15} />
        </button>
      )}
    </nav>
  )
}

// A textarea that grows with its content.
export function AutoTextarea({ value, onChange, placeholder, className, rows = 2, onKeyDown }: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  rows?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref} rows={rows} className={className} placeholder={placeholder} value={value}
      onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
    />
  )
}

// Keyword / template-field chips with an add box (Enter or the + button).
export function ChipEditor({ items, placeholder, onAdd, onRemove }: {
  items: { key: string; label: string }[]
  placeholder: string
  onAdd: (value: string) => void
  onRemove: (key: string) => void
}) {
  const [draft, setDraft] = useState('')
  function submit() {
    if (!draft.trim()) return
    onAdd(draft)
    setDraft('')
  }
  return (
    <div className="wrChipRow">
      {items.map(item => (
        <span key={item.key} className="wrChip">
          {item.label}
          <button type="button" aria-label={`Remove ${item.label}`} onClick={() => onRemove(item.key)}>×</button>
        </span>
      ))}
      <span className="wrChipAdd">
        <input
          value={draft} placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
        />
        <button type="button" aria-label={`Add ${placeholder}`} disabled={!draft.trim()} onClick={submit}><PlusIcon size={12} /></button>
      </span>
    </div>
  )
}

// A whole-number input that shows thousands separators (160,000) while
// keeping the value a plain number. Empty means null.
export function NumberInput({ value, onChange, className, ...rest }: {
  value: number | null
  onChange: (value: number | null) => void
  className?: string
  'aria-label'?: string
  placeholder?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  // Digits to the right of the caret, so it can be put back after the commas move.
  const digitsAfterCaret = useRef<number | null>(null)
  const text = value === null ? '' : value.toLocaleString('en-US')

  useLayoutEffect(() => {
    const input = ref.current
    const after = digitsAfterCaret.current
    if (!input || after === null) return
    digitsAfterCaret.current = null
    let pos = text.length
    for (let seen = 0; pos > 0; pos--) {
      if (seen === after) break
      if (/\d/.test(text[pos - 1])) seen++
    }
    input.setSelectionRange(pos, pos)
  }, [text])

  return (
    <input
      {...rest} ref={ref} className={className} type="text" inputMode="numeric" value={text}
      onChange={e => {
        const raw = e.target.value
        const caret = e.target.selectionStart ?? raw.length
        digitsAfterCaret.current = raw.slice(caret).replace(/\D/g, '').length
        const digits = raw.replace(/\D/g, '')
        onChange(digits === '' ? null : parseInt(digits, 10))
      }}
    />
  )
}
