import { useState } from 'react'
import type { ReaderSettings } from '../../../api/reader'
import { CrackedHeartIcon, ExportIcon, FlagIcon, HeartIcon, PlusIcon, SpeakIcon, TrashIcon } from '../../icons'
import { Card, Chip, Stat } from './ReaderBits'
import type { PagesSession } from './PagesSession'
import type { ReaderCtx } from './readerContext'
import { shortDate } from './readerFormat'
import { countMarks, notesMarkdown, parseKey } from './pagesLogic'

// The consoles beside the page in PAGES: Flags, Reactions, Footnotes, Annotations and Settings. They share the reading session with the page.

const useRun = () => {
  const [error, setError] = useState<string | null>(null)
  const run = async (call: () => Promise<unknown>) => {
    setError(null)
    try { await call() } catch (e) { setError(e instanceof Error ? e.message : 'That did not go through.') }
  }
  return { error, run }
}

export function FlagsConsole({ ctx, session }: { ctx: ReaderCtx; session: PagesSession }) {
  const { reader, actions } = ctx.data
  const [name, setName] = useState('')
  const { error, run } = useRun()
  if (!reader) return null
  const here = session.chapter?.flags ?? []
  const used = Object.entries(session.marks).filter(([k, m]) => parseKey(k)?.chapter === session.n && m.flags.length > 0)
  const flagNames = [...new Map(here.map(f => [f.flagKey, f])).values()]
  return (
    <>
      <Card title="Flags in this chapter" Icon={FlagIcon}>
        {flagNames.length === 0 ? <p className="rdMuted">The author flagged nothing in this chapter.</p> : (
          <ul className="rdList">
            {flagNames.map(f => (
              <li key={f.flagKey} className="rdItem">
                <div className="rdItemMain"><b>{f.name}</b><span className="rdMuted">{here.filter(h => h.flagKey === f.flagKey).length} passage(s)</span></div>
                <Chip on title="Set in your account (User > Account > Flags)">{reader.flagClasses[f.flagKey] ?? f.defaultClass}</Chip>
              </li>
            ))}
          </ul>
        )}
        <p className="rdMuted">Each flag takes one of four classes: hidden, marked, highlight or spoiler. You set them for every book in your account: User &rsaquo; Account &rsaquo; Flags.</p>
      </Card>
      <Card title="My flags" Icon={FlagIcon}>
        {reader.myFlags.length === 0 ? <p className="rdMuted">Make a flag of your own (Simplify, Check later, Too slow) and put it on any sentence. Only you see it.</p> : (
          <ul className="rdList">
            {reader.myFlags.map(f => (
              <li key={f.key} className="rdItem">
                <div className="rdItemMain"><b>{f.name}</b><span className="rdMuted">{reader.flagClasses[f.key] ?? 'marked'}</span></div>
                <button type="button" className="rdIconBtn rdIconBtn--small" aria-label={`Delete my flag ${f.name}`} onClick={() => void run(() => actions.deleteMyFlag(f.key))}><TrashIcon size={16} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="rdRow">
          <input className="rdField rdGrow" aria-label="New flag name" placeholder="New flag name" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
          <button type="button" className="rdBtn" disabled={!name.trim()} onClick={() => void run(async () => { await actions.addMyFlag(name); setName('') })}><PlusIcon size={16} />Add</button>
        </div>
        {error && <p className="rdError" role="alert">{error}</p>}
        <span className="rdMuted">{used.length} sentence(s) of this chapter carry a flag.</span>
      </Card>
    </>
  )
}

export function ReactionsConsole({ ctx, session }: { ctx: ReaderCtx; session: PagesSession }) {
  const { reader, actions } = ctx.data
  const { error, run } = useRun()
  if (!reader) return null
  const counts = countMarks(session.marks, session.n)
  const totals = session.totals
  const share = (on: boolean) => run(() => actions.setSettings({ ...reader.settings, shareReactions: on }))
  return (
    <>
      <Card title="My reactions in this chapter" Icon={HeartIcon}>
        <div className="rdGrid3">
          <Stat value={counts.marked} label="sentences marked" />
          <Stat value={counts.pleasant} label="pleasant" />
          <Stat value={counts.unpleasant} label="unpleasant" />
        </div>
        <div className="rdRow">
          <span className="rdRow"><HeartIcon size={16} />Pleasant</span><span className="rdRow"><CrackedHeartIcon size={16} />Unpleasant</span><span className="rdRow"><FlagIcon size={16} />My flags</span>
          <span className="rdMuted">Select a sentence and raise a reaction (three levels, then off); the strength shows in the tracks beside the text.</span>
        </div>
        <div className="rdRow">
          <button type="button" className="rdBtn" aria-pressed={session.tracks} onClick={() => session.setTracks(!session.tracks)}>{session.tracks ? 'Hide' : 'Show'} the tracks</button>
        </div>
      </Card>
      <Card title="Other readers, anonymously" Icon={HeartIcon}>
        {totals ? (
          <>
            <div className="rdGrid3">
              <Stat value={totals.readers.toLocaleString('en-US')} label="readers marked this" />
              <Stat value={totals.pleasant.toLocaleString('en-US')} label="pleasant" />
              <Stat value={totals.unpleasant.toLocaleString('en-US')} label="unpleasant" />
            </div>
            {totals.top.length > 0 && (
              <ul className="rdList" aria-label="Most marked sentences">
                {totals.top.map(t => (
                  <li key={t.key} className="rdItem">
                    <button type="button" className="rdLink rdGrow" onClick={() => { const at = parseKey(t.key); if (at) { session.jumpTo(at.paragraph); session.select(t.key) } }}>Paragraph {(parseKey(t.key)?.paragraph ?? 0) + 1}, sentence {(parseKey(t.key)?.sentence ?? 0) + 1}</button>
                    <span className="rdMuted">{t.pleasant} pleasant · {t.unpleasant} unpleasant</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : <p className="rdMuted">Loading…</p>}
        <label className="rdCheck"><input type="checkbox" checked={reader.settings.shareReactions} onChange={e => void share(e.target.checked)} />Share my reactions with the author, without my name</label>
        <p className="rdMuted">Totals are anonymous. Your reactions are saved with your account either way; sharing decides only whether they count in what the author sees.</p>
        {error && <p className="rdError" role="alert">{error}</p>}
      </Card>
    </>
  )
}

export function FootnotesConsole({ ctx, session }: { ctx: ReaderCtx; session: PagesSession }) {
  const chapter = session.chapter
  if (!chapter) return <p className="rdMuted">Open a chapter to see its footnotes.</p>
  return (
    <Card title={`Footnotes, chapter ${session.n}`} Icon={FlagIcon}>
      {chapter.footnotes.length === 0 ? <p className="rdMuted">The author published no footnotes in this chapter.</p> : (
        <ul className="rdList">
          {chapter.footnotes.map((f, i) => {
            const at = parseKey(f.key)
            return (
              <li key={f.id} className="rdItem">
                <div className="rdItemMain">
                  <b>{i + 1}. {f.title}</b><span>{f.text}</span>
                  {at && <button type="button" className="rdLink rdMuted" onClick={() => { session.jumpTo(at.paragraph); session.select(f.key) }}>Go to paragraph {at.paragraph + 1}, sentence {at.sentence + 1}</button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="rdMuted">Published by the author on the sentence they belong to. The page&rsquo;s margin shows them too.</p>
    </Card>
  )
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function AnnotationsConsole({ ctx, session }: { ctx: ReaderCtx; session: PagesSession }) {
  const { reader, actions } = ctx.data
  const { error, run } = useRun()
  if (!reader) return null
  const mine = reader.notes.filter(n => n.bookId === session.book.id)
  const exportNotes = () => download(`${session.book.id}-notes.md`, notesMarkdown(session.book.title, session.book.authorName, mine), 'text/markdown')
  return (
    <Card title="Highlights, notes and bookmarks" Icon={FlagIcon}>
      {mine.length === 0 ? <p className="rdMuted">Select a sentence in the page to highlight it, write a note or bookmark it.</p> : (
        <ul className="rdList" aria-label="My annotations">
          {mine.map(n => (
            <li key={n.id} className="rdItem">
              <div className="rdItemMain">
                <span className="rdMuted">{n.kind}{n.chapter ? ` · chapter ${n.chapter}` : ''} · {shortDate(n.at)}</span>
                {n.quote && <span className="rdQuote">&ldquo;{n.quote}&rdquo;</span>}
                {n.note && <span>{n.note}</span>}
                {n.chapter && n.key && <button type="button" className="rdLink rdMuted" onClick={() => ctx.openPages(session.book.id, n.chapter as number)}>Open chapter {n.chapter}</button>}
              </div>
              <button type="button" className="rdIconBtn rdIconBtn--small" aria-label="Delete annotation" onClick={() => void run(() => actions.deleteNote(n.id))}><TrashIcon size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="rdRow"><button type="button" className="rdBtn" disabled={mine.length === 0} onClick={exportNotes}><ExportIcon size={16} />Export highlights and notes (Markdown)</button></div>
      {error && <p className="rdError" role="alert">{error}</p>}
    </Card>
  )
}

const FONTS: { key: ReaderSettings['font']; label: string }[] = [{ key: 'serif', label: 'Serif' }, { key: 'sans', label: 'Sans' }, { key: 'easy', label: 'Easy-read' }]

export function SettingsConsole({ ctx, session }: { ctx: ReaderCtx; session: PagesSession }) {
  const { reader, actions } = ctx.data
  const { error, run } = useRun()
  if (!reader) return null
  const s = reader.settings
  const set = (patch: Partial<ReaderSettings>) => void run(() => actions.setSettings({ ...s, ...patch }))
  const pick = <T extends string>(options: { key: T; label: string }[], current: T, on: (v: T) => void, label: string) => (
    <span className="rdRow" role="group" aria-label={label}>{options.map(o => <button key={o.key} type="button" className={current === o.key ? 'rdBtn rdBtn--small rdBtn--on' : 'rdBtn rdBtn--small'} aria-pressed={current === o.key} onClick={() => on(o.key)}>{o.label}</button>)}</span>
  )
  const position = reader.positions[session.book.id]
  return (
    <>
      <Card title="Type" Icon={FlagIcon}>
        <div className="rdRow"><span className="rdGrow">Font</span>{pick(FONTS, s.font, font => set({ font }), 'Font')}</div>
        <div className="rdRow">
          <span className="rdGrow">Text size</span>
          <button type="button" className="rdBtn rdBtn--small" aria-label="Smaller text" disabled={s.textSize <= 12} onClick={() => set({ textSize: s.textSize - 1 })}>A−</button>
          <span aria-live="polite">{s.textSize} px</span>
          <button type="button" className="rdBtn rdBtn--small" aria-label="Larger text" disabled={s.textSize >= 32} onClick={() => set({ textSize: s.textSize + 1 })}>A+</button>
        </div>
        <div className="rdRow"><span className="rdGrow">Line spacing</span>{pick([{ key: 'tight', label: 'Tight' }, { key: 'roomy', label: 'Roomy' }] as const, s.spacing, spacing => set({ spacing }), 'Line spacing')}</div>
      </Card>
      <Card title="Page and access" Icon={FlagIcon}>
        <div className="rdRow"><span className="rdGrow">Turning</span>{pick([{ key: 'turn', label: 'Turn pages' }, { key: 'scroll', label: 'Scroll' }] as const, s.mode, mode => set({ mode }), 'Turning')}</div>
        <div className="rdRow"><span className="rdGrow">Margins</span>{pick([{ key: 'narrow', label: 'Narrow' }, { key: 'wide', label: 'Wide' }] as const, s.margins, margins => set({ margins }), 'Margins')}</div>
        <div className="rdRow"><span className="rdGrow">Page tone</span>{pick([{ key: 'day', label: 'Day' }, { key: 'night', label: 'Night' }] as const, s.tone, tone => set({ tone }), 'Page tone')}</div>
        <label className="rdCheck"><input type="checkbox" checked={s.highContrast} onChange={e => set({ highContrast: e.target.checked })} />High contrast</label>
        <label className="rdCheck"><input type="checkbox" checked={s.focus} onChange={e => set({ focus: e.target.checked })} />Reading focus: fade the controls while you read</label>
      </Card>
      <Card title="Read aloud" Icon={SpeakIcon}>
        <div className="rdRow">
          <button type="button" className="rdBtn" disabled={!session.canSpeak || !session.chapter} title={session.canSpeak ? undefined : 'Your system has no speech voice available'} onClick={session.speaking ? session.stopSpeaking : session.speak}>
            <SpeakIcon size={16} />{session.speaking ? 'Stop' : 'Start'}
          </button>
          <span className="rdGrow" />
          <span>Speed</span>
          <select className="rdField" aria-label="Reading speed" value={s.readAloudRate} onChange={e => set({ readAloudRate: Number(e.target.value) })}>
            {[0.75, 1, 1.25, 1.5, 2].map(r => <option key={r} value={r}>{r}×</option>)}
          </select>
        </div>
        <p className="rdMuted">Reads the page in view with your system&rsquo;s own voice.</p>
      </Card>
      <Card title="Reading position" Icon={FlagIcon}>
        <p>{position ? <>Saved on <b>{position.device}</b>: chapter {position.chapter}, {shortDate(position.at)}.</> : 'Your position is saved as you turn pages.'}</p>
        <p className="rdMuted">Open this book on another device and it resumes where you stopped. Settings sync the same way.</p>
      </Card>
      {error && <p className="rdError" role="alert">{error}</p>}
    </>
  )
}
