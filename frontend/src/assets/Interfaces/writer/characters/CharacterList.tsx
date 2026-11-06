import { useState } from 'react'
import { CheckIcon, CloseIcon, CopyIcon, PeopleIcon, PlusIcon, TrashIcon } from '../../../icons'
import type { Characters } from './useCharacters'

// The cast: each character by name, with a copy and a delete that asks first; the plus makes a new one.
export function CharacterList({ c }: { c: Characters }) {
  const [confirming, setConfirming] = useState<string | null>(null)
  return (
    <nav className="charList" aria-label="Cast">
      <header className="charPanelHead">
        <h3 className="charPanelTitle">Cast</h3>
        <button type="button" className="charIconBtn" aria-label="New character" title="New character" onClick={() => { void c.create() }}><PlusIcon size={16} /></button>
      </header>
      {c.cast.length === 0 && <p className="charHint">No characters yet. Make the first one with the plus.</p>}
      <ul className="charRows">
        {c.cast.map(ch => (
          <li key={ch.id} className={`charRowItem${ch.id === c.openId ? ' charRowItem--on' : ''}`}>
            <button type="button" className="charRowMain" aria-label={`Open ${ch.name}`} aria-current={ch.id === c.openId ? 'true' : undefined} title={`Open ${ch.name}`} onClick={() => { void c.open(ch.id) }}>
              <PeopleIcon size={14} />
              <span className="charRowName">{ch.name}</span>
            </button>
            <button type="button" className="charIconBtn charRowTool" aria-label={`Copy ${ch.name}`} title={`Make a copy of ${ch.name}`} onClick={() => { void c.duplicate(ch.id) }}><CopyIcon size={16} /></button>
            {confirming === ch.id ? (
              <span className="charConfirm" role="group" aria-label={`Delete ${ch.name}?`}>
                <button type="button" className="charIconBtn" aria-label="Confirm delete" title="Confirm delete" onClick={() => { setConfirming(null); void c.remove(ch.id) }}><CheckIcon size={16} /></button>
                <button type="button" className="charIconBtn" aria-label="Cancel delete" title="Cancel" onClick={() => setConfirming(null)}><CloseIcon size={16} /></button>
              </span>
            ) : (
              <button type="button" className="charIconBtn charRowTool" aria-label={`Delete ${ch.name}`} title={`Delete ${ch.name}`} onClick={() => setConfirming(ch.id)}><TrashIcon size={16} /></button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
