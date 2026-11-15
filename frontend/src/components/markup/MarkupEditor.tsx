import { useDeferredValue, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { EyeIcon, FlagIcon, HelpIcon, LayoutMidiIcon, PencilIcon } from '../../assets/icons'
import { useStoredState } from '../../assets/Interfaces/writer/storage'
import { CHEAT_SHEET } from '../../lib/markup/cheatSheet'
import { checksOf, type MarkupCheck } from '../../lib/markup/checks'
import { parseCached } from '../../lib/markup/parse'
import { Markup } from './Markup'
import './markup.scss'

// The markup editor (Resources articles and quizzes, Training material, descriptions and assessments): a text field with three views,
// Write, Read-only (the formatted text) and Side by side, a checks panel that lists what is wrong by line (a click goes to the line) and a
// cheat sheet of the markers. No insert toolbar: the text is typed. The view is remembered on this computer for every editor.

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

export function MarkupEditor({ value, onChange, label, baseLevel = 2, rows = 8, placeholder, maxLength, onBlur, className, footer }: MarkupEditorProps) {
  const [view, setView] = useStoredState<MarkupView>('scriblr.markup.view', 'write')
  const [cheat, setCheat] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const cheatId = useId()
  const shown = useDeferredValue(value)
  const checks = useMemo(() => checksOf(shown, parseCached(shown)), [shown])
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
          <textarea
            ref={field} className="mkField" aria-label={label} rows={rows} value={value} placeholder={placeholder} maxLength={maxLength} spellCheck
            onChange={e => onChange(e.target.value)} onBlur={onBlur}
          />
        )}
        {view !== 'write' && (
          <div className="mkPreview" aria-label={`${label}, formatted`} role="region">
            <Markup text={shown} baseLevel={baseLevel} empty={<p className="mkEmpty">Nothing written yet.</p>} />
          </div>
        )}
      </div>
      <ChecksPanel checks={checks} onGo={go} />
      {footer}
    </div>
  )
}

export default MarkupEditor
