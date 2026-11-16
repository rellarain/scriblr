import { useDeferredValue, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { TrainingContentDraft } from '../../api/types'
import { EyeIcon, FlagIcon, HelpIcon, LayoutMidiIcon, PencilIcon } from '../../assets/icons'
import { useStoredState } from '../../assets/Interfaces/writer/storage'
import { CHEAT_SHEET } from '../../lib/markup/cheatSheet'
import { checksOf, linksOf, type MarkupCheck } from '../../lib/markup/checks'
import { parseCached } from '../../lib/markup/parse'
import { insertLink, linkOptions, linkQueryAt, type LinkQuery, type PickerOption } from '../../lib/markup/picker'
import { useLinkContext } from './linkContext'
import { Markup } from './Markup'
import './markup.scss'

// The markup editor (Resources articles and quizzes, Training material, descriptions and assessments): a text field with three views,
// Write, Read-only (the formatted text) and Side by side, a checks panel that lists what is wrong by line (a click goes to the line) and a
// cheat sheet of the markers. No insert toolbar: the text is typed. Typing `@` where a link may start opens the link picker: what the link could
// point at, by title (arrows choose, Enter or Tab puts its id path in, Escape closes). The view is remembered on this computer for every editor.

export type MarkupView = 'write' | 'read' | 'side'

const VIEWS: Array<{ key: MarkupView; label: string; Icon: typeof PencilIcon }> = [
  { key: 'write', label: 'Write', Icon: PencilIcon },
  { key: 'read', label: 'Read-only', Icon: EyeIcon },
  { key: 'side', label: 'Side by side', Icon: LayoutMidiIcon },
]

export interface MarkupEditorProps {
  value: string
  onChange: (next: string) => void
  // What the field is (its accessible name).
  label: string
  // The level of the heading of what holds the text, for the formatted view.
  baseLevel?: number
  rows?: number
  placeholder?: string
  maxLength?: number
  onBlur?: () => void
  className?: string
  // Shown under the field (e.g. the ids a quiz's questions were given).
  footer?: ReactNode
  // The Training courses being edited, for links to them and the picker (the Instructor's draft); else the saved ones.
  training?: TrainingContentDraft
}

// Where a line starts and ends in a text, for going to it.
function lineRange(text: string, line: number): [number, number] {
  let start = 0
  for (let k = 1; k < line; k++) {
    const next = text.indexOf('\n', start)
    if (next < 0) return [text.length, text.length]
    start = next + 1
  }
  const end = text.indexOf('\n', start)
  return [start, end < 0 ? text.length : end]
}

export function ChecksPanel({ checks, onGo }: { checks: MarkupCheck[]; onGo: (line: number) => void }) {
  if (checks.length === 0) return null
  return (
    <ul className="mkChecks" role="list" aria-label="Checks">
      {checks.map((c, k) => (
        <li key={`${c.line}:${k}`}>
          <button type="button" className="mkCheck" onClick={() => onGo(c.line)}>
            <FlagIcon size={13} /><span className="mkCheckLine">Line {c.line}</span> {c.message}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function CheatSheet({ id }: { id: string }) {
  return (
    <div className="mkCheat" id={id} role="region" aria-label="Markup cheat sheet">
      {(['Headings', 'Lists', 'Text', 'Knowledge checks'] as const).map(group => (
        <section key={group} className="mkCheatGroup">
          <h4 className="mkCheatTitle">{group}</h4>
          <dl className="mkCheatList">
            {CHEAT_SHEET.filter(e => e.group === group).map(e => (
              <div key={e.example} className="mkCheatRow">
                <dt><code>{e.example}</code></dt>
                <dd>{e.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

// The link picker under the field: the options for the link being typed (`role="listbox"`, the field points at the one chosen).
function LinkPicker({ id, options, active, onPick }: { id: string; options: PickerOption[]; active: number; onPick: (o: PickerOption) => void }) {
  return (
    <ul className="mkPicker" id={id} role="listbox" aria-label="Link to">
      {options.length === 0 && <li className="mkPickerNone" role="option" aria-selected={false} aria-disabled="true">Nothing by that name.</li>}
      {options.map((o, k) => (
        <li
          key={o.id} id={`${id}-${k}`} role="option" aria-selected={k === active} className={`mkPickerOption mkPickerOption--${o.kind}`}
          onMouseDown={e => { e.preventDefault(); onPick(o) }}
        >
          <span className="mkPickerLabel">{o.label}</span><span className="mkPickerPath">{o.insert}</span>
        </li>
      ))}
    </ul>
  )
}

export function MarkupEditor({ value, onChange, label, baseLevel = 2, rows = 8, placeholder, maxLength, onBlur, className, footer, training }: MarkupEditorProps) {
  const [view, setView] = useStoredState<MarkupView>('scriblr.markup.view', 'write')
  const [cheat, setCheat] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const cheatId = useId()
  const pickerId = useId()
  const shown = useDeferredValue(value)
  const [query, setQuery] = useState<LinkQuery | null>(null)
  const [active, setActive] = useState(0)
  const parsed = parseCached(shown)
  const links = useLinkContext(shown, query !== null || linksOf(parsed.blocks).length > 0, training)
  const checks = useMemo(() => checksOf(shown, parsed, links), [shown, parsed, links])
  const options = useMemo(() => (query ? linkOptions(query.query, links.resources, links.training, links.headings) : []), [query, links])
  // the link being typed at the caret, read again after every key and click in the field
  const track = (el: HTMLTextAreaElement) => {
    const q = el.selectionStart === el.selectionEnd ? linkQueryAt(el.value, el.selectionStart) : null
    setQuery(prev => (prev?.start === q?.start && prev?.query === q?.query ? prev : q))
    if (!q || q.start !== query?.start) setActive(0)
  }
  const pick = (option: PickerOption) => {
    const el = field.current
    if (!el || !query) return
    const next = insertLink(el.value, query, el.selectionStart, option)
    onChange(next.text)
    setQuery(null)
    window.setTimeout(() => { el.focus(); el.setSelectionRange(next.caret, next.caret) })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!query) return
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuery(null) }
    else if (options.length === 0) return
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % options.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + options.length) % options.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(options[Math.min(active, options.length - 1)]) }
  }
  const go = (line: number) => {
    const el = field.current
    if (view === 'read') setView('write')
    window.setTimeout(() => {
      const target = field.current ?? el
      if (!target) return
      const [start, end] = lineRange(target.value, line)
      target.focus()
      target.setSelectionRange(start, end)
    })
  }
  const writing = view !== 'read'
  return (
    <div className={`mkEditor mkEditor--${view}${className ? ` ${className}` : ''}`}>
      <div className="mkBar">
        <div className="mkViews" role="group" aria-label={`View of ${label}`}>
          {VIEWS.map(({ key, label: name, Icon }) => (
            <button key={key} type="button" className="mkIconBtn" aria-pressed={view === key} aria-label={name} title={name} onClick={() => setView(key)}><Icon size={16} /></button>
          ))}
        </div>
        {checks.length > 0 && <span className="mkCheckCount" role="status" aria-label={`${checks.length} ${checks.length === 1 ? 'check' : 'checks'}`} title="Checks"><FlagIcon size={13} />{checks.length}</span>}
        <button type="button" className="mkIconBtn" aria-label="Markup cheat sheet" title="Markup cheat sheet" aria-expanded={cheat} aria-controls={cheat ? cheatId : undefined} onClick={() => setCheat(c => !c)}><HelpIcon size={16} /></button>
      </div>
      {cheat && <CheatSheet id={cheatId} />}
      <div className="mkPanes">
        {writing && (
          <div className="mkFieldWrap">
            <textarea
              ref={field} className="mkField" aria-label={label} rows={rows} value={value} placeholder={placeholder} maxLength={maxLength} spellCheck
              aria-autocomplete="list" aria-expanded={query !== null} aria-controls={query ? pickerId : undefined}
              aria-activedescendant={query && options.length > 0 ? `${pickerId}-${Math.min(active, options.length - 1)}` : undefined}
              onChange={e => { onChange(e.target.value); track(e.target) }} onKeyDown={onKeyDown}
              onKeyUp={e => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) track(e.currentTarget) }}
              onClick={e => track(e.currentTarget)}
              onBlur={() => { setQuery(null); onBlur?.() }}
            />
            {query && <LinkPicker id={pickerId} options={options} active={Math.min(active, Math.max(0, options.length - 1))} onPick={pick} />}
          </div>
        )}
        {view !== 'write' && (
          <div className="mkPreview" aria-label={`${label}, formatted`} role="region">
            <Markup text={shown} baseLevel={baseLevel} training={training} empty={<p className="mkEmpty">Nothing written yet.</p>} />
          </div>
        )}
      </div>
      <ChecksPanel checks={checks} onGo={go} />
      {footer}
    </div>
  )
}

export default MarkupEditor
