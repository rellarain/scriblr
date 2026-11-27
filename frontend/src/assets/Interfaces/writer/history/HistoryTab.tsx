import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { getOutlineSnapshot, getPlotSnapshot, getRevisionDiff, getRevisionSnapshot, listOutlineHistory, listPlotHistory, listProjectRevisions, revertRevision } from '../../../../api/historyFetch'
import type { ChapterRevisionSummary, DiffOp, TreeSnapshotSummary } from '../../../../types'
import type { FacetActivityData } from '../../../../lib/facets'
import {
  dayLine, filterItems, HISTORY_KINDS, historyDays, historyItems, KIND_FACET, KIND_LABEL, type HistoryItem, type HistoryKind,
} from '../../../../lib/historyTimeline'
import { RestoreIcon } from '../../../icons'
import { changeChapterOnBackend } from '../draftInserts'
import { getFacetActivity } from '../schedule/scheduleApi'
import { DEFAULT_HUES, facetHueVars, type FacetHues } from '../schedule/ScheduleSettings'
import { localToday } from '../schedule/useSchedule'
import { useStoredState } from '../storage'
import type { WriterWorkspace } from '../useWriterWorkspace'

// The Project level's History tab: the project's history as one timeline by day (lib/historyTimeline.ts), the newest first: the writing, the
// outline's and the plot's snapshots, the chapters' revisions and the flags. Chips keep some kinds, a choice keeps one book. A day shows its first
// four changes, the rest behind "N more on this day"; fourteen days show, then "Older days". A revision compares with the chapter now (what is gone
// since struck through, what is new underlined). Restore puts the outline or the plot back through the workspace (an edit like any other: undone
// at once, kept by Save), or the chapter back on the backend (which keeps it as it was first; an open draft saves before and reads it again after).

const SHOWN_ITEMS = 4
const DAYS_AT_ONCE = 14

interface Loaded { facets: FacetActivityData; outline: TreeSnapshotSummary[]; plot: TreeSnapshotSummary[]; revisions: ChapterRevisionSummary[] }

function useProjectHistory(projectId: string | null) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!projectId) return undefined
    let live = true
    setError(null)
    Promise.all([getFacetActivity(projectId), listOutlineHistory(projectId), listPlotHistory(projectId), listProjectRevisions(projectId)])
      .then(([facets, outline, plot, revisions]) => { if (live) setData({ facets, outline, plot, revisions }) })
      .catch(() => { if (live) setError('The history could not be read. Check that Scriblr is running, then try again.') })
    return () => { live = false }
  }, [projectId, tick])
  return { data, error, reload: useCallback(() => setTick(n => n + 1), []) }
}

// Long stretches that did not change are cut to their ends.
const CONTEXT = 70
function clip(text: string): string {
  return text.length <= CONTEXT * 2 + 3 ? text : `${text.slice(0, CONTEXT)} … ${text.slice(-CONTEXT)}`
}

function Compare({ w, chapterId, snapshotId }: { w: WriterWorkspace; chapterId: string; snapshotId: string }) {
  const projectId = w.activeProjectId as string
  const [moments, setMoments] = useState<Array<{ id: string; ops: DiffOp[] }> | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    const nowIds = w.outlineNodes.filter(n => n.kind === 'moment' && chapterOf(w, n.id) === chapterId).map(n => n.id)
    getRevisionSnapshot(projectId, chapterId, snapshotId)
      .then(async snap => {
        const ids = [...new Set([...Object.keys(snap.moments), ...nowIds])]
        const diffs = await Promise.all(ids.map(async id => ({ id, ops: (await getRevisionDiff(projectId, chapterId, id, snapshotId)).ops })))
        if (live) setMoments(diffs.filter(d => d.ops.some(op => op.op !== 'equal')))
      })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
    // The comparison is of the chapter as saved now, read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, chapterId, snapshotId])
  if (error) return <p className="wrError" role="alert">The comparison could not be read.</p>
  if (!moments) return <p className="wrHistoryNote" role="status">Comparing…</p>
  if (moments.length === 0) return <p className="wrHistoryNote">No changes since then.</p>
  return (
    <div className="wrHistoryCompare" aria-label="Changes since then">
      <span className="wrHistoryNote">Then against now: struck through is gone since, underlined is new.</span>
      {moments.map(m => (
        <p key={m.id} className="wrHistoryDiff">
          {m.ops.map((op, i) => (op.op === 'equal' ? <span key={i}>{clip(op.text)}</span> : op.op === 'delete' ? <del key={i}>{op.text}</del> : <ins key={i}>{op.text}</ins>))}
        </p>
      ))}
    </div>
  )
}

function chapterOf(w: WriterWorkspace, id: string): string | null {
  const byId = new Map(w.outlineNodes.map(n => [n.id, n]))
  for (let at = byId.get(id), guard = 0; at && guard < 12; at = at.parentId ? byId.get(at.parentId) : undefined, guard += 1) if (at.kind === 'chapter') return at.id
  return null
}

function Row({ w, item, onRestored }: { w: WriterWorkspace; item: HistoryItem; onRestored: () => void }) {
  const [comparing, setComparing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const projectId = w.activeProjectId as string
  const what = item.restore?.scope === 'chapter' ? 'the chapter' : `the ${item.restore?.scope}`
  async function restore() {
    const r = item.restore
    if (!r) return
    setConfirming(false)
    setState('working')
    try {
      if (r.scope === 'chapter') {
        const { chapterId, snapshotId } = r
        await changeChapterOnBackend(projectId, chapterId, () => revertRevision(projectId, chapterId, snapshotId))
      } else if (r.scope === 'outline') w.restoreOutline((await getOutlineSnapshot(projectId, r.snapshotId)).nodes)
      else w.restorePlot((await getPlotSnapshot(projectId, r.snapshotId)).nodes)
      setState('done')
      onRestored()
    } catch {
      setState('error')
    }
  }
  return (
    <li className="wrHistoryItem">
      <span className="wrHistoryTime">{item.time}</span>
      <span className="wrHistoryKind" style={{ '--kind': `var(--wr-f-${KIND_FACET[item.kind]})` } as CSSProperties}><i aria-hidden="true" />{KIND_LABEL[item.kind]}</span>
      <span className="wrHistoryText">
        {item.text}
        {state === 'done' && <span className="wrHistoryNote" role="status">{item.restore?.scope === 'chapter' ? ' Put back.' : ' Put back: Undo takes it back, Save keeps it.'}</span>}
        {state === 'error' && <span className="wrError" role="alert"> It could not be put back.</span>}
      </span>
      <span className="wrHistoryActions">
        {item.compare && <button type="button" className="wrSmallBtn" aria-expanded={comparing} onClick={() => setComparing(c => !c)}>{comparing ? 'Hide changes' : 'Compare'}</button>}
        {item.restore && !confirming && (
          <button type="button" className="wrSmallBtn" disabled={state === 'working'} onClick={() => setConfirming(true)}>
            <RestoreIcon size={13} /> {state === 'working' ? 'Restoring…' : 'Restore'}
          </button>
        )}
        {confirming && (
          <span className="wrHistoryConfirm" role="group" aria-label="Restore">
            <span>Put {what} back as it was{item.time ? ` at ${item.time}` : ''}?</span>
            <button type="button" className="wrSmallBtn wrSmallBtn--accent" onClick={() => void restore()}>Restore</button>
            <button type="button" className="wrSmallBtn" onClick={() => setConfirming(false)}>Cancel</button>
          </span>
        )}
      </span>
      {comparing && item.compare && <div className="wrHistoryMore"><Compare w={w} chapterId={item.compare.chapterId} snapshotId={item.compare.snapshotId} /></div>}
    </li>
  )
}

export function HistoryTab({ w }: { w: WriterWorkspace }) {
  const projectId = w.activeProjectId
  const { data, error, reload } = useProjectHistory(projectId)
  const [hues] = useStoredState<FacetHues>('scriblr.writer.facetHues', DEFAULT_HUES)
  const [kinds, setKinds] = useState<HistoryKind[] | null>(null)
  const [book, setBook] = useState('')
  const [search, setSearch] = useState('')
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({})
  const [shown, setShown] = useState(DAYS_AT_ONCE)
  const today = localToday()
  const items = useMemo(() => (data ? historyItems({
    events: data.facets.events ?? [], daily: data.facets.daily ?? {}, outline: data.outline, plot: data.plot, revisions: data.revisions, nodes: w.outlineNodes,
  }) : []), [data, w.outlineNodes])
  const days = useMemo(() => historyDays(filterItems(items, kinds, book || null, search), data?.facets.daily ?? {}, today), [items, kinds, book, search, data, today])
  const books = w.outlineNodes.filter(n => n.kind === 'book')
  const toggle = (k: HistoryKind) => setKinds(prev => {
    const now = prev ?? []
    const next = now.includes(k) ? now.filter(x => x !== k) : [...now, k]
    return next.length === 0 || next.length === HISTORY_KINDS.length ? null : next
  })

  if (!projectId) return <p className="wrMuted">Open a project to see its history.</p>
  return (
    <div className="wrHistory" style={facetHueVars(hues) as CSSProperties}>
      <div className="wrHistoryHead">
        <div className="wrChoice" role="group" aria-label="Show">
          <button type="button" aria-pressed={kinds === null} className={kinds === null ? 'on' : undefined} onClick={() => setKinds(null)}>All</button>
          {HISTORY_KINDS.map(k => (
            <button key={k} type="button" aria-pressed={!!kinds?.includes(k)} className={kinds?.includes(k) ? 'on' : undefined} onClick={() => toggle(k)}>
              {k === 'revision' ? 'Revisions' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <select className="wrField wrHistoryBook" aria-label="Book" value={book} onChange={e => setBook(e.target.value)}>
          <option value="">Every book</option>
          {books.map((b, i) => <option key={b.id} value={b.id}>Book {i + 1}{b.title.trim() ? ` · ${b.title.trim()}` : ''}</option>)}
        </select>
        <input className="wrField wrHistorySearch" type="search" aria-label="Search the history" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {error && <p className="wrError" role="alert">{error}</p>}
      {!data && !error && <p className="wrHistoryNote" role="status">Reading the history…</p>}
      {data && days.length === 0 && <p className="wrHistoryNote">{items.length === 0 ? 'Nothing in the history yet.' : 'Nothing like that in the history.'}</p>}
      {days.slice(0, shown).map(d => {
        const open = openDays[d.day] ?? false
        return (
          <section key={d.day} className="wrHistoryDay" aria-label={d.label}>
            <h4 className="wrHistoryDayHead">{dayLine(d)}</h4>
            <ul className="wrHistoryItems">
              {(open ? d.items : d.items.slice(0, SHOWN_ITEMS)).map(item => <Row key={item.id} w={w} item={item} onRestored={reload} />)}
            </ul>
            {!open && d.items.length > SHOWN_ITEMS && (
              <button type="button" className="wrSmallBtn wrHistoryMoreBtn" onClick={() => setOpenDays(prev => ({ ...prev, [d.day]: true }))}>
                {d.items.length - SHOWN_ITEMS} more on this day
              </button>
            )}
          </section>
        )
      })}
      {days.length > shown && <button type="button" className="wrSmallBtn wrHistoryMoreBtn" onClick={() => setShown(n => n + DAYS_AT_ONCE)}>Older days</button>}
      <p className="wrHistoryNote wrHistoryFoot">
        Restore puts back the outline, the plot or the chapter as it was at that point, and is itself kept in the history, so it can be undone. Writing
        and flags are a record only.
      </p>
    </div>
  )
}

export default HistoryTab
