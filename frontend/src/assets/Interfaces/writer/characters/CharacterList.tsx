import { useMemo, useRef, useState, type CSSProperties } from 'react'
import type { CharacterFigure, CharacterPortrait } from '../../../../api/types'
import { CheckIcon, CloseIcon, CopyIcon, ExportIcon, ImportIcon, PlusIcon, TrashIcon } from '../../../icons'
import SideResizer from '../levels/SideResizer'
import { saveBlob } from '../maps/mapExport'
import { useStoredState } from '../storage'
import { characterFileName, importRows, parseCharacterFile, type CharacterChoice, type CharacterFile } from './charFile'
import { START_GENRE_KEY, useStartGenres } from './figure/figureStart'
import { clampListWidth, LIST_DEFAULT_W, LIST_WIDTH_KEY, listVars } from './listWidth'
import { PortraitCard } from './PortraitCard'
import { readableInk } from './portrait/colour'
import { defaultPortrait } from './portrait/defaults'
import type { Characters } from './useCharacters'

const DEFAULT_TILE = defaultPortrait().tileColor
const HEX = /^#[0-9a-fA-F]{6}$/

// The colours a character's card is drawn in: the colour of the portrait's tile as the background, and an ink that can be read on it (the tile can be any colour at all). They
// are the character's own, so they are set on the card itself and the stylesheet only refers to them.
function cardColours(portrait: CharacterPortrait | undefined, figure: CharacterFigure | null | undefined): CSSProperties {
  // A character with a figure has the card colour of the figure (the portrait's is no longer shown).
  const wanted = figure ? figure.tile : portrait?.tileColor
  const tile = wanted && HEX.test(wanted) ? wanted : DEFAULT_TILE
  return { '--cardBg': tile, '--cardInk': readableInk(tile) } as CSSProperties
}

// The cast: each character as a card (the portrait on the character's own colour, and the name), with a save to file, a copy and a delete that asks first; the plus makes a new one.
export function CharacterList({ c }: { c: Characters }) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<CharacterFile | null>(null)
  const [problem, setProblem] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  // The genre a new character's first look is rolled within (remembered on this computer; one the model no longer has counts as any).
  const startGenres = useStartGenres()
  const [storedGenre, setStartGenre] = useStoredState<string>(START_GENRE_KEY, '')
  const startGenre = startGenres.some(g => g.id === storedGenre) ? storedGenre : ''
  // The width of the column: kept on this computer, null until it is dragged. While the handle is dragged the width goes straight to the column's CSS variable (no render per
  // mouse move); the stored width is set on release.
  const [width, setWidth] = useStoredState<number | null>(LIST_WIDTH_KEY, null)
  const column = useRef<HTMLDivElement>(null)
  const dragWidth = (w: number | null) => {
    const style = column.current?.style
    if (!style) return
    if (w === null) style.removeProperty('--char-list-w')
    else for (const [name, value] of Object.entries(listVars(w))) style.setProperty(name, value)
  }

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
    <div className="charListCol" ref={column} style={listVars(width)}>
      <nav className="charList" aria-label="Cast">
        <header className="charPanelHead">
          <h3 className="charPanelTitle">Cast</h3>
          <span className="charRow">
            <button type="button" className="charIconBtn" aria-label="Save the whole cast to a file" title="Save the whole cast to a file" disabled={c.cast.length === 0} onClick={() => { void exportThem(null, 'cast') }}><ExportIcon size={16} /></button>
            <button type="button" className="charIconBtn" aria-label="Import characters from a file" title="Import characters from a file" onClick={() => fileInput.current?.click()}><ImportIcon size={16} /></button>
            <span className="charStart">
              {startGenres.length > 0 && (
                <select className="charSelect charSelect--auto charStartGenre" aria-label="Genre of a new character" title="The genre a new character's first look is rolled within" value={startGenre} onChange={e => setStartGenre(e.target.value)}>
                  <option value="">Any genre</option>
                  {startGenres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              <button type="button" className="charIconBtn" aria-label="New character" title="New character: a mannequin with a first look rolled within the genre" onClick={() => { void c.createStarted(startGenre || null) }}><PlusIcon size={16} /></button>
            </span>
          </span>
          <input ref={fileInput} type="file" accept=".json,application/json" className="charFileInput" aria-label="Character file" tabIndex={-1} onChange={e => { void readFile(e.target.files?.[0]); e.target.value = '' }} />
        </header>
        {problem && <p className="charHint" role="alert">{problem}</p>}
        {incoming && <ImportForm c={c} file={incoming} onDone={() => setIncoming(null)} />}
        {c.cast.length === 0 && <p className="charHint">No characters yet. Make the first one with the plus.</p>}
        <ul className="charRows">
          {c.cast.map(ch => {
            // The open character's portrait is the live one (a change that is not saved yet shows); the others are as saved.
            const live = c.doc?.id === ch.id ? c.doc : ch
            const { portrait, figure } = live
            return (
              <li key={ch.id} className={`charRowItem charRowItem--card${ch.id === c.openId ? ' charRowItem--on' : ''}`} style={cardColours(portrait, figure)}>
                <button type="button" className="charRowMain" aria-label={`Open ${ch.name}`} aria-current={ch.id === c.openId ? 'true' : undefined} title={`Open ${ch.name}`} onClick={() => { void c.open(ch.id) }}>
                  <PortraitCard portrait={portrait} figure={figure} name={ch.name} className="charRowCard" />
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
      <SideResizer
        className="charResizer" label="Cast width" what="the cast list" clamp={clampListWidth} value={width ?? LIST_DEFAULT_W} keyStep={16}
        onDrag={dragWidth} onCommit={setWidth} onReset={() => { setWidth(null); dragWidth(null) }}
      />
    </div>
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
