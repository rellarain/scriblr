import { useEffect, useMemo } from 'react'
import type { FlagClass } from '../../api/reader'
import { loadReader, useReader } from './reader/readerStore'

// UUI Account > Flags: how the reader treats each content flag, for every book. An author puts flags on a book (a warning and its details); the
// reader gives each one a class, and it applies wherever it appears: hidden (the passage is replaced by a one-line placeholder), marked (a flag
// icon on the text, without details), highlight (the details are shown with the passage) or spoiler (a spoiler description, shown only on a tap).

const CLASSES: { key: FlagClass; label: string; text: string }[] = [
  { key: 'hidden', label: 'Hidden', text: 'The passage is replaced by a one-line placeholder; tap to reveal.' },
  { key: 'marked', label: 'Marked', text: 'A flag icon on the text, without details.' },
  { key: 'highlight', label: 'Highlight', text: 'The flag and its details are shown with the passage.' },
  { key: 'spoiler', label: 'Spoiler', text: 'A spoiler description, shown only when you tap it.' },
]

export default function FlagSettings() {
  const data = useReader()
  useEffect(() => { void loadReader() }, [])
  const flags = useMemo(() => {
    const byKey = new Map<string, { key: string; name: string; defaultClass: FlagClass; books: number }>()
    for (const book of data.books) {
      for (const f of book.flags) {
        const seen = byKey.get(f.key)
        if (seen) seen.books += 1
        else byKey.set(f.key, { key: f.key, name: f.name, defaultClass: f.defaultClass, books: 1 })
      }
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [data.books])

  if (data.status === 'error') return <p role="alert">{data.error}</p>
  if (!data.reader) return <p role="status">Loading your flags…</p>
  const reader = data.reader
  return (
    <div className="uFlags">
      <p>Each content flag takes one of four classes, set here for every book. An author&rsquo;s default is used until you choose.</p>
      <ul className="uFlagList" aria-label="Flag classes">
        {flags.map(flag => {
          const current = reader.flagClasses[flag.key] ?? flag.defaultClass
          return (
            <li key={flag.key} className="uFlagRow">
              <span className="uFlagName"><b>{flag.name}</b><small>{flag.books === 1 ? 'on 1 book' : `on ${flag.books} books`}</small></span>
              <span className="uFlagClasses" role="group" aria-label={`How to treat ${flag.name}`}>
                {CLASSES.map(c => (
                  <button key={c.key} type="button" className="uFlagBtn" aria-pressed={current === c.key} title={c.text} onClick={() => void data.actions.setFlagClass(flag.key, c.key)}>{c.label}</button>
                ))}
              </span>
            </li>
          )
        })}
        {flags.length === 0 && <li>No book in the library carries a flag yet.</li>}
      </ul>
      <dl className="uFlagKey">
        {CLASSES.map(c => <div key={c.key}><dt>{c.label}</dt><dd>{c.text}</dd></div>)}
      </dl>
    </div>
  )
}
