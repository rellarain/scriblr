import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { countsLine, shapeLines, templateFrom, TEMPLATE_NAME_MAX, type OutlineTemplate, type TemplateKind } from '../../../../lib/outlineTemplates'
import { ChevronDownIcon, PencilIcon } from '../../../icons'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { DeleteControl } from '../shared'
import { useOutlineTemplates } from './useOutlineTemplates'

// The writer's outline templates (lib/outlineTemplates.ts): saving a book's or a chapter's shape as one (SaveTemplate, opened from the book's
// card in the project outline or the chapter's tools on its book's Outline), starting a new book or chapter from one (FromTemplate, beside the
// + Book and + Chapter buttons) and the list of them to rename and delete (TemplatesTile, the Project level's Templates tab).

// The menu's width (in _templates.scss).
const MENU_WIDTH = 260
let counter = 0
const newTemplateId = () => `tpl_${Date.now().toString(36)}${(counter += 1).toString(36)}`

export function SaveTemplate({ w, rootId, kind, label, onClose }: {
  w: WriterWorkspace
  rootId: string
  kind: TemplateKind
  // What the book or chapter is called here ("Book 1", "Chapter 3").
  label: string
  onClose: () => void
}) {
  const { save } = useOutlineTemplates()
  const root = w.outlineNodes.find(n => n.id === rootId)
  const [name, setName] = useState(root?.title.trim() || `${label} shape`)
  const [titles, setTitles] = useState(true)
  const [summaries, setSummaries] = useState(true)
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.select() }, [])
  const shape = templateFrom(w.outlineNodes, rootId, kind, name, { titles, summaries }, 'preview', '')
  const lines = shapeLines(shape)
  const ready = name.trim() !== ''
  const submit = () => {
    if (!ready) return
    save(templateFrom(w.outlineNodes, rootId, kind, name, { titles, summaries }, newTemplateId(), new Date().toISOString()))
    onClose()
  }
  return (
    <div
      className="wrTplSave" role="dialog" aria-label={`Save ${label} as a template`}
      // Its keys are its own (the outline's card keys stay out of its fields); Escape closes it.
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose() }}
    >
      <span className="wrTplSaveTitle">Save {label}’s shape as a template</span>
      <label className="wrBookEdField">
        <span className="wrLabel">Name</span>
        <input
          ref={nameRef} className="wrField" aria-label="Template name" maxLength={TEMPLATE_NAME_MAX} value={name}
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
      </label>
      <fieldset className="wrTplKeeps">
        <legend className="wrLabel">Keeps</legend>
        <label><input type="checkbox" checked disabled /> {kind === 'book' ? 'Arcs, chapters, acts, scenes and moments' : 'Acts, scenes and moments'}</label>
        <label><input type="checkbox" checked={titles} onChange={e => setTitles(e.target.checked)} /> Their titles</label>
        <label><input type="checkbox" checked={summaries} onChange={e => setSummaries(e.target.checked)} /> Their summaries</label>
        <span className="wrTplNote">Never the draft. Colours and plotpoints stay with the {kind}.</span>
      </fieldset>
      <div className="wrTplShape" aria-label="The shape that is saved">
        {lines.length === 0 && <span>{countsLine(shape)}</span>}
        {lines.map((l, i) => <span key={i} className={l.depth ? 'wrTplShapeLine wrTplShapeLine--in' : 'wrTplShapeLine'}>{l.text}</span>)}
      </div>
      <div className="wrTplActions">
        <button type="button" className="wrSmallBtn" onClick={onClose}>Cancel</button>
        <button type="button" className="wrSmallBtn wrSmallBtn--accent" disabled={!ready} onClick={submit}>Save template</button>
      </div>
    </div>
  )
}

// "From a template": a menu of the writer's templates of a kind, each with what it holds, and the empty book or chapter last.
export function FromTemplate({ kind, onPick, onEmpty, className = 'wrSmallBtn' }: {
  kind: TemplateKind
  onPick: (template: OutlineTemplate) => void
  onEmpty: () => void
  className?: string
}) {
  const { ofKind } = useOutlineTemplates()
  const [open, setOpen] = useState(false)
  // Which way it opens: from the button's left edge, or from its right when there is no room for it to the right in its tile.
  const [toLeft, setToLeft] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const list = ofKind(kind)
  const button = useRef<HTMLButtonElement>(null)
  const pick = (fn: () => void) => { setOpen(false); fn() }
  // Opened, the first choice has the focus; the arrows, Home and End move among the choices, Escape closes it and gives the focus back.
  useEffect(() => { if (open) wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus() }, [open])
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (!open) return
    const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') { setOpen(false); button.current?.focus() }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      items[e.key === 'ArrowDown' ? (at + 1) % items.length : at <= 0 ? items.length - 1 : at - 1]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1]?.focus() }
  }
  return (
    <span className="wrTplFrom" ref={wrap} onKeyDown={onKeyDown}>
      <button
        ref={button} type="button" className={className} aria-haspopup="menu" aria-expanded={open}
        onClick={() => {
          const at = button.current?.getBoundingClientRect()
          const edge = button.current?.closest('.wrTabTile, .wrTabPane, .wrBookCover')?.getBoundingClientRect().right ?? window.innerWidth
          setToLeft(!!at && at.left + MENU_WIDTH > edge)
          setOpen(o => !o)
        }}
      >
        From a template <ChevronDownIcon size={13} />
      </button>
      {open && (
        <div className={toLeft ? 'wrTplMenu wrTplMenu--left' : 'wrTplMenu'} role="menu" aria-label={`New ${kind} from`}>
          {list.length === 0 && <span className="wrTplMenuNote">No {kind} templates yet: save a {kind}’s shape from its {kind === 'book' ? 'card' : 'tools'}.</span>}
          {list.map(t => (
            <button key={t.id} type="button" role="menuitem" onClick={() => pick(() => onPick(t))}>
              <b>{t.name}</b><span>{countsLine(t)}</span>
            </button>
          ))}
          <button type="button" role="menuitem" className="wrTplMenuEmpty" onClick={() => pick(onEmpty)}><b>An empty {kind}</b></button>
        </div>
      )}
    </span>
  )
}

function TemplateRow({ t }: { t: OutlineTemplate }) {
  const { rename, remove } = useOutlineTemplates()
  const [editing, setEditing] = useState<string | null>(null)
  const done = () => { if (editing !== null) rename(t.id, editing); setEditing(null) }
  return (
    <li className="wrTplRow">
      {editing === null
        ? <b className="wrTplRowName">{t.name}</b>
        : (
          <input
            className="wrField" aria-label={`Rename ${t.name}`} autoFocus maxLength={TEMPLATE_NAME_MAX} value={editing}
            onChange={e => setEditing(e.target.value)} onBlur={done}
            onKeyDown={e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') setEditing(null) }}
          />
        )}
      <span className="wrTplRowCounts">{countsLine(t)}</span>
      <button type="button" className="wrIconBtn" aria-label={`Rename ${t.name}`} title="Rename" onClick={() => setEditing(t.name)}><PencilIcon size={15} /></button>
      <DeleteControl tone="dark" message={`Delete the template ${t.name}? Books and chapters made from it stay.`} onConfirm={() => remove(t.id)} />
    </li>
  )
}

// The Project level's Templates tab: the writer's book and chapter templates, to rename and delete.
export function TemplatesTile() {
  const { ofKind } = useOutlineTemplates()
  const group = (kind: TemplateKind, title: string) => {
    const list = ofKind(kind)
    return (
      <section className="wrTplGroup" aria-label={title}>
        <span className="wrLabel">{title} · {list.length}</span>
        {list.length === 0
          ? <span className="wrTplNote">None yet.</span>
          : <ul className="wrTplList">{list.map(t => <TemplateRow key={t.id} t={t} />)}</ul>}
      </section>
    )
  }
  return (
    <div className="wrTemplates">
      <p className="wrTplNote">Your own outline shapes, for every project. Make one from a book here, or from a chapter on its book’s Outline; start a new book or chapter from one.</p>
      {group('book', 'Book templates')}
      {group('chapter', 'Chapter templates')}
      <p className="wrTplHint">On a book’s Outline, <b>+ Chapter</b> has the same <b>From a template</b> choice, and an open chapter’s tools have <b>Save as a template</b>.</p>
    </div>
  )
}
