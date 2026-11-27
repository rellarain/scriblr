import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, LinkIcon, MoveToIcon, PinIcon, SplitParagraphIcon } from '../../../icons'
import { AutoTextarea } from '../shared'
import { paragraphAt, paragraphRanges, type Range } from '../paragraphs'
import { longSentences, repeatedWords, type StyleAids } from '../styleAids'

// One moment's draft text with the paragraph tools and the style aids (draft/DraftCards.tsx puts one in each moment's card).
//
// The text box stays one native text box, so typing, selecting, copying and undo work as anywhere. Behind it a copy of the text in the same
// type and size (the mirror, transparent text) marks the style aids (a long sentence underlined with a wave, a repeated word with a bar under
// it) and says where each paragraph is, so its number stands in the gutter beside it. The paragraph the caret is in shows its tools in the
// gutter: up, down, to another moment, split at the caret, join with the next. Under the box a line for that paragraph: its long sentences,
// the plotpoints pinned to it (each moves with it) and a picker to pin one of the moment's plotpoints to it.

export interface MomentDestination { id: string; label: string; detail: string }
export interface ChapterDestination { id: string; label: string; moments: MomentDestination[] }
export interface MomentPin { pointId: string; placementId: string; title: string; paragraph: number | null }

export interface MomentTools {
  move: (paragraph: number, by: -1 | 1) => number | null
  split: (offset: number) => number | null
  join: (paragraph: number) => number | null
  moveTo: (paragraph: number, chapterId: string, momentId: string, where: 'start' | 'end') => Promise<void>
  busy: boolean
}

interface Mark extends Range { cls: string }

// The mirror's content: the paragraphs as spans (measured for the gutter), each cut where a mark starts or ends.
function mirror(body: string, paragraphs: Range[], marks: Mark[], spans: Map<number, HTMLSpanElement>): ReactNode[] {
  const out: ReactNode[] = []
  let at = 0
  paragraphs.forEach((p, i) => {
    if (p.start > at) out.push(body.slice(at, p.start))
    const cuts = new Set([p.start, p.end])
    for (const m of marks) {
      if (m.start > p.start && m.start < p.end) cuts.add(m.start)
      if (m.end > p.start && m.end < p.end) cuts.add(m.end)
    }
    const points = [...cuts].sort((a, b) => a - b)
    const pieces: ReactNode[] = []
    for (let k = 0; k + 1 < points.length; k += 1) {
      const [from, to] = [points[k], points[k + 1]]
      const cls = marks.filter(m => m.start <= from && to <= m.end).map(m => m.cls).join(' ')
      const text = body.slice(from, to)
      pieces.push(cls ? <span key={from} className={cls}>{text}</span> : text)
    }
    out.push(<span key={`p${i}`} ref={el => { if (el) spans.set(i, el); else spans.delete(i) }}>{pieces}</span>)
    at = p.end
  })
  if (at < body.length) out.push(body.slice(at))
  out.push('​') // a final line break still makes a line, as it does in the text box
  return out
}

const TOOLBAR_HEIGHT = 5 * 26 + 4 * 2

export function MomentDraft({ momentId, label, placeholder, value, onChange, aids, tools, destinations, chapterId, pins, onPin, keyField }: {
  momentId: string
  label: string
  placeholder: string
  value: string
  onChange: (text: string) => void
  aids: StyleAids
  // None for a draft with nowhere to move to (a chapter's free draft with no outline).
  tools: MomentTools | null
  destinations: ChapterDestination[]
  chapterId: string
  // The moment's own placements (a plotpoint on this moment), pinned to a paragraph or not.
  pins: MomentPin[]
  onPin: (pointId: string, placementId: string, paragraph: number | null) => void
  keyField?: 'draft'
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const spans = useRef(new Map<number, HTMLSpanElement>())
  const [caret, setCaret] = useState<number | null>(null)
  const [tops, setTops] = useState<number[]>([])
  const [moving, setMoving] = useState(false)
  const pendingCaret = useRef<number | null>(null)

  const paragraphs = useMemo(() => paragraphRanges(value), [value])
  const long = useMemo(() => (aids.long ? longSentences(value, aids.longWords) : []), [value, aids.long, aids.longWords])
  const marks = useMemo<Mark[]>(() => [
    ...long.map(s => ({ start: s.start, end: s.end, cls: 'wrAidLong' })),
    ...(aids.repeat ? repeatedWords(value, aids.repeatGap).map(r => ({ ...r, cls: 'wrAidRepeat' })) : []),
  ], [value, long, aids.repeat, aids.repeatGap])
  const active = caret === null ? -1 : paragraphAt(paragraphs, caret)

  // Where each paragraph starts, down the field, for its number and the tools.
  useLayoutEffect(() => {
    const measure = () => {
      const field = fieldRef.current
      if (!field) return
      const base = field.getBoundingClientRect().top
      const next = paragraphs.map((_, i) => {
        const el = spans.current.get(i)
        return el ? Math.round(el.getBoundingClientRect().top - base) : 0
      })
      setTops(prev => (prev.length === next.length && prev.every((t, i) => t === next[i]) ? prev : next))
    }
    measure()
    const field = fieldRef.current
    if (!field || typeof ResizeObserver === 'undefined') return undefined
    const watch = new ResizeObserver(measure)
    watch.observe(field)
    return () => watch.disconnect()
  }, [paragraphs, marks])

  // After a tool changed the text, the caret goes where the tool says (and the box keeps the focus).
  useLayoutEffect(() => {
    const at = pendingCaret.current
    const input = inputRef.current
    if (at === null || !input) return
    pendingCaret.current = null
    input.focus()
    input.setSelectionRange(at, at)
    setCaret(at)
  }, [value])

  const run = (next: number | null) => { if (next !== null) pendingCaret.current = next }
  const keep = (e: React.MouseEvent) => e.preventDefault() // a tool keeps the caret in the text

  const n = active + 1
  const caretInside = caret !== null && active >= 0 && paragraphs[active].start < caret && caret < paragraphs[active].end
  const activeTop = active >= 0 ? tops[active] ?? 0 : 0
  const pinnedHere = pins.filter(p => p.paragraph === active)
  const longHere = long.filter(s => s.paragraph === active)

  return (
    <div
      className="wrMomentDraft"
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setCaret(null); setMoving(false) } }}
    >
      {/* With the tools out, the gutter is as tall as they are, so they never run over what comes after the text. */}
      <div className="wrParaGutter" style={tools && active >= 0 ? { minHeight: activeTop + TOOLBAR_HEIGHT } : undefined}>
        {paragraphs.map((_, i) => {
          const top = tops[i] ?? 0
          if (tools && active >= 0 && i !== active && top >= activeTop && top < activeTop + TOOLBAR_HEIGHT) return null
          if (tools && i === active) return null
          const pinned = pins.some(p => p.paragraph === i)
          return (
            <span key={i} className="wrParaNum" style={{ top }} aria-hidden="true">
              ¶{i + 1}{pinned && <PinIcon size={13} />}
            </span>
          )
        })}
        {tools && active >= 0 && (
          <div className="wrParaTools" role="toolbar" aria-label={`Paragraph ${n}`} style={{ top: activeTop }}>
            <button type="button" className="wrParaTool" aria-label="Move the paragraph up" title="Move up" disabled={active === 0 || tools.busy} onMouseDown={keep} onClick={() => run(tools.move(active, -1))}><ChevronUpIcon size={14} /></button>
            <button type="button" className="wrParaTool" aria-label="Move the paragraph down" title="Move down" disabled={active >= paragraphs.length - 1 || tools.busy} onMouseDown={keep} onClick={() => run(tools.move(active, 1))}><ChevronDownIcon size={14} /></button>
            <button
              type="button" className={moving ? 'wrParaTool wrParaTool--on' : 'wrParaTool'} aria-label="Move the paragraph to another moment" title="Move to another moment"
              aria-expanded={moving} disabled={tools.busy} onMouseDown={keep} onClick={() => setMoving(m => !m)}
            ><MoveToIcon size={14} /></button>
            <button type="button" className="wrParaTool" aria-label="Split the paragraph at the cursor" title="Split at the cursor" disabled={!caretInside || tools.busy} onMouseDown={keep} onClick={() => caret !== null && run(tools.split(caret))}><SplitParagraphIcon size={14} /></button>
            <button type="button" className="wrParaTool" aria-label="Join with the next paragraph" title="Join with the next" disabled={active >= paragraphs.length - 1 || tools.busy} onMouseDown={keep} onClick={() => run(tools.join(active))}><LinkIcon size={14} /></button>
          </div>
        )}
      </div>
      <div className="wrDraftField" ref={fieldRef}>
        <div className="wrDraftMirror" aria-hidden="true">{mirror(value, paragraphs, marks, spans.current)}</div>
        <AutoTextarea
          className="wrDraftText wrDraftText--mirrored" placeholder={placeholder} aria-label={label} value={value} onChange={onChange}
          keyField={keyField} inputRef={inputRef} onCaret={setCaret}
        />
      </div>
      {tools && moving && active >= 0 && (
        <MoveDialog
          paragraph={n} momentId={momentId} chapterId={chapterId} destinations={destinations} pinned={pinnedHere.length > 0} top={activeTop + 30}
          onCancel={() => setMoving(false)}
          onMove={(toChapter, toMoment, where) => { setMoving(false); setCaret(null); void tools.moveTo(active, toChapter, toMoment, where) }}
        />
      )}
      {active >= 0 && (longHere.length > 0 || pins.length > 0) && (
        <div className="wrParaLine" aria-label={`Paragraph ${n}`}>
          <span className="wrParaLineNum">¶{n}</span>
          {longHere.map(s => <span key={s.start} className="wrParaLong">Long sentence: {s.words} words</span>)}
          {pinnedHere.map(p => (
            <span key={p.placementId} className="wrParaPin">
              <PinIcon size={13} />Plotpoint: {p.title || 'Untitled'} · moves with this paragraph
              <button type="button" className="wrParaUnpin" aria-label={`Unpin ${p.title || 'the plotpoint'}`} title="Unpin" onMouseDown={keep} onClick={() => onPin(p.pointId, p.placementId, null)}><CloseIcon size={12} /></button>
            </span>
          ))}
          {pins.some(p => p.paragraph !== active) && (
            <select
              className="wrParaPinSelect" aria-label={`Pin a plotpoint to paragraph ${n}`} value=""
              onChange={e => { const pin = pins.find(p => p.placementId === e.target.value); if (pin) onPin(pin.pointId, pin.placementId, active) }}
            >
              <option value="">Pin a plotpoint here…</option>
              {pins.filter(p => p.paragraph !== active).map(p => (
                <option key={p.placementId} value={p.placementId}>{p.title || 'Untitled'}{p.paragraph !== null ? ` (now ¶${p.paragraph + 1})` : ''}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

// Where a paragraph goes: a chapter of the book (this one first), one of its moments, and the start or the end of it.
function MoveDialog({ paragraph, momentId, chapterId, destinations, pinned, top, onCancel, onMove }: {
  paragraph: number
  top: number
  momentId: string
  chapterId: string
  destinations: ChapterDestination[]
  pinned: boolean
  onCancel: () => void
  onMove: (chapterId: string, momentId: string, where: 'start' | 'end') => void
}) {
  const [chapter, setChapter] = useState(chapterId)
  const [target, setTarget] = useState<string | null>(null)
  const [where, setWhere] = useState<'start' | 'end'>('start')
  const moments = (destinations.find(c => c.id === chapter)?.moments ?? []).filter(m => m.id !== momentId)
  return (
    <div className="wrParaMove" role="dialog" aria-label={`Move paragraph ${paragraph}`} style={{ top }} onKeyDown={e => { if (e.key === 'Escape') onCancel() }}>
      <span className="wrParaMoveHead">Move paragraph {paragraph} to</span>
      {destinations.length > 1 && (
        <select className="wrParaPinSelect" aria-label="Chapter" value={chapter} onChange={e => { setChapter(e.target.value); setTarget(null) }}>
          {destinations.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      )}
      {moments.length === 0
        ? <span className="wrParaMoveHint">This chapter has no other moment.</span>
        : (
          <div className="wrParaDests" role="group" aria-label="Moment">
            {moments.map(m => (
              <button key={m.id} type="button" aria-pressed={target === m.id} className={target === m.id ? 'wrParaDest wrParaDest--on' : 'wrParaDest'} onClick={() => setTarget(m.id)}>
                <span className="wrParaDestName">{m.label}</span><span className="wrParaDestDetail">{m.detail}</span>
              </button>
            ))}
          </div>
        )}
      <div className="wrParaWhere" role="group" aria-label="Where in the moment">
        {(['start', 'end'] as const).map(w => (
          <button key={w} type="button" aria-pressed={where === w} className={where === w ? 'wrParaDest wrParaDest--on' : 'wrParaDest'} onClick={() => setWhere(w)}>{w === 'start' ? 'At the start' : 'At the end'}</button>
        ))}
      </div>
      {pinned && <span className="wrParaMoveHint">Its pinned plotpoint goes with it.</span>}
      <div className="wrParaMoveActions">
        <button type="button" className="wrParaBtn" onClick={onCancel}>Cancel</button>
        <button type="button" className="wrParaBtn wrParaBtn--main" disabled={!target} onClick={() => target && onMove(chapter, target, where)}>Move</button>
      </div>
    </div>
  )
}

export default MomentDraft
