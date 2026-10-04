import { useEffect, useRef, useState } from 'react'

// Text that is plain until it is clicked: then it becomes an input (or a textarea) to edit
// in place, and goes back to plain text on Enter (single line), Escape or leaving it.
export function ClickToEdit({ value, onChange, placeholder, label, className, multiline = false }: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  // What the field is called for assistive tech ("Chapter title").
  label: string
  className?: string
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!editing) return
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  if (editing) {
    const shared = {
      ref, value, placeholder, 'aria-label': label, className: `wrClickEdit wrClickEdit--editing ${className ?? ''}`,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      onBlur: () => setEditing(false),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && !multiline)) { e.preventDefault(); setEditing(false) }
      },
    }
    return multiline ? <textarea rows={3} {...shared} /> : <input {...shared} />
  }
  return (
    <button
      type="button" className={`wrClickEdit ${value.trim() === '' ? 'wrClickEdit--empty ' : ''}${className ?? ''}`}
      title={`Edit ${label.toLowerCase()}`} aria-label={`${label}: ${value.trim() === '' ? 'empty' : value}. Click to edit`} onClick={() => setEditing(true)}
    >
      {value.trim() === '' ? placeholder : value}
    </button>
  )
}

export default ClickToEdit
