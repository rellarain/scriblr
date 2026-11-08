import { useMemo, useRef, useState, type CSSProperties } from 'react'
import type { CharacterPortrait } from '../../../../api/types'
import { CheckIcon, CloseIcon, CopyIcon, ExportIcon, ImportIcon, PlusIcon, TrashIcon } from '../../../icons'
import { saveBlob } from '../maps/mapExport'
import { characterFileName, importRows, parseCharacterFile, type CharacterChoice, type CharacterFile } from './charFile'
import { PortraitCard } from './PortraitCard'
import { readableInk } from './portrait/colour'
import { defaultPortrait } from './portrait/defaults'
import type { Characters } from './useCharacters'

const DEFAULT_TILE = defaultPortrait().tileColor
const HEX = /^#[0-9a-fA-F]{6}$/

// The colours a character's card is drawn in: the colour of the portrait's tile as the background, and an ink that can be read on it (the tile can be any colour at all). They
// are the character's own, so they are set on the card itself and the stylesheet only refers to them.
function cardColours(portrait: CharacterPortrait | undefined): CSSProperties {
  const tile = portrait && HEX.test(portrait.tileColor) ? portrait.tileColor : DEFAULT_TILE
  return { '--cardBg': tile, '--cardInk': readableInk(tile) } as CSSProperties
}

// The cast: each character as a card (the portrait on the character's own colour, and the name), with a save to file, a copy and a delete that asks first; the plus makes a new one.
export function CharacterList({ c }: { c: Characters }) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<CharacterFile | null>(null)
  const [problem, setProblem] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  async function exportThem(ids: string[] | null, name: string) {
    const file = await c.exportFile(ids)
    if (file) saveBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), characterFileName(name))
  }
  async function readFile(f: File | undefined) {
    if (!f) return
    setProblem('')
    const text = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result ?? '')); r.onerror = () => reject(r.error); r.readAsText(f) })
    const parsed = parseCharacterFile(text)
    if (parsed.ok) setIncoming(parsed.file)
    else setProblem(parsed.error)
  }
  return (
    <nav className="charList" aria-label="Cast">
      <header className="charPanelHead">
        <h3 className="charPanelTitle">Cast</h3>
        <span className="charRow">
          <button type="button" className="charIconBtn" aria-label="Save the whole cast to a file" title="Save the whole cast to a file" disabled={c.cast.length === 0} onClick={() => { void exportThem(null, 'cast') }}><ExportIcon size={16} /></button>
          <button type="button" className="charIconBtn" aria-label="Import characters from a file" title="Import characters from a file" onClick={() => fileInput.current?.click()}><ImportIcon size={16} /></button>
          <button type="button" className="charIconBtn" aria-label="New character" title="New character" onClick={() => { void c.create() }}><PlusIcon size={16} /></button>
        </span>
        <input ref={fileInput} type="file" accept=".json,application/json" className="charFileInput" aria-label="Character file" tabIndex={-1} onChange={e => { void readFile(e.target.files?.[0]); e.target.value = '' }} />
      </header>
      {problem && <p className="charHint" role="alert">{problem}</p>}
      {incoming && <ImportForm c={c} file={incoming} onDone={() => setIncoming(null)} />}
      {c.cast.length === 0 && <p className="charHint">No characters yet. Make the first one with the plus.</p>}
      <ul className="charRows">
        {c.cast.map(ch => {
          // The open character's portrait is the live one (a change that is not saved yet shows); the others are as saved.
          const portrait = c.doc?.id === ch.id ? c.doc.portrait : ch.portrait
          return (
            <li key={ch.id} className={`charRowItem charRowItem--card${ch.id === c.openId ? ' charRowItem--on' : ''}`} style={cardColours(portrait)}>
              <button type="button" className="charRowMain" aria-label={`Open ${ch.name}`} aria-current={ch.id === c.openId ? 'true' : undefined} title={`Open ${ch.name}`} onClick={() => { void c.open(ch.id) }}>
                <PortraitCard portrait={portrait} name={ch.name} className="charRowCard" />
              </button>
              <span className="charRowTools">
                <button type="button" className="charIconBtn charRowTool" aria-label={`Save ${ch.name} to a file`} title={`Save ${ch.name} to a file`} onClick={() => { void exportThem([ch.id], ch.name) }}><ExportIcon size={16} /></button>
                <button type="button" className="charIconBtn charRowTool" aria-label={`Copy ${ch.name}`} title={`Make a copy of ${ch.name}`} onClick={() => { void c.duplicate(ch.id) }}><CopyIcon size={16} /></button>
                {confirming === ch.id ? (
                  <span className="charConfirm" role="group" aria-label={`Delete ${ch.name}?`}>
                    <button type="button" className="charIconBtn" aria-label="Confirm delete" title="Confirm delete" onClick={() => { setConfirming(null); void c.remove(ch.id) }}><CheckIcon size={16} /></button>
                    <button type="button" className="charIconBtn" aria-label="Cancel delete" title="Cancel" onClick={() => setConfirming(null)}><CloseIcon size={16} /></button>
                  </span>
                ) : (
                  <button type="button" className="charIconBtn charRowTool" aria-label={`Delete ${ch.name}`} title={`Delete ${ch.name}`} onClick={() => setConfirming(ch.id)}><TrashIcon size={16} /></button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// What an import does: each character of the file, with a choice (bring it new, replace the one that has its id, or leave it out) for those the project already has.
function ImportForm({ c, file, onDone }: { c: Characters; file: CharacterFile; onDone: () => void }) {
  const rows = useMemo(() => importRows(file, c.cast), [file, c.cast])
  const [choices, setChoices] = useState<Map<string, CharacterChoice>>(new Map())
  const [busy, setBusy] = useState(false)
  async function bring() {
    setBusy(true)
    const r = await c.importFile(file, choices)
    setBusy(false)
    if (r && !r.error) onDone()
  }
  return (
    <form className="charImport" aria-label="Import characters" onSubmit={e => { e.preventDefault(); void bring() }}>
      <ul className="charList2">
        {rows.map(({ doc, clash }) => (
          <li key={doc.id} className="charRow">
            <span className="charRowName">{doc.name}</span>
            {clash ? (
              <select className="charSelect charSelect--auto" aria-label={`What to do with ${doc.name}, whom the project has already`} value={choices.get(doc.id) ?? 'both'} onChange={e => setChoices(prev => new Map(prev).set(doc.id, e.target.value as CharacterChoice))}>
                <option value="both">Keep both</option>
                <option value="replace">Replace the one here</option>
                <option value="skip">Leave out</option>
              </select>
            ) : <span className="charHint">new</span>}
          </li>
        ))}
      </ul>
      <p className="charHint">Links to characters that are not in the file are dropped.</p>
      <div className="charRow">
        <button type="submit" className="charIconBtn" aria-label="Import the characters" title="Import the characters" disabled={busy}><CheckIcon size={16} /></button>
        <button type="button" className="charIconBtn" aria-label="Cancel the import" title="Cancel" onClick={onDone}><CloseIcon size={16} /></button>
      </div>
    </form>
  )
}
