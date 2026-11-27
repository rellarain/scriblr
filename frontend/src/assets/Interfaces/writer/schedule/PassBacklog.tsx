import { useState } from 'react'
import { kindLabel, passesInOrder, passFlags, passState, type RevisionPass } from '../../../../lib/revisionPasses'
import type { RevisionFlag } from './scheduleApi'

// A running revision pass's open flags, as tasks in the Backlog (a group for each pass): its name, how many are open and when it is due (its
// last day), and a row for each flag of its kinds (the kind, where it is, the flagged text in quotation marks, or the note of a flag on the
// whole project). A row opens its chapter. The first five show; the rest are behind "N more".

const SHOWN = 5
const dayName = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function PassBacklog({ passes, flags, today, whereOf, search, onOpenChapter }: {
  passes: RevisionPass[]
  flags: RevisionFlag[]
  today: string
  // Where a chapter is, said short ("Book 1 · Ch 3").
  whereOf: (chapterId: string) => string
  search: string
  onOpenChapter?: (chapterId: string) => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const ordered = passesInOrder(passes)
  const needle = search.trim().toLowerCase()
  const matches = (f: RevisionFlag) => !needle || [kindLabel(f.type), f.snippet, f.note, f.chapterId ? whereOf(f.chapterId) : ''].some(t => t.toLowerCase().includes(needle))
  return (
    <>
      {ordered.map((pass, i) => {
        if (passState(pass, today) !== 'running' || pass.kinds.length === 0) return null
        const all = passFlags(pass, flags, today).open
        const shown = all.filter(matches)
        if (needle && shown.length === 0) return null
        const name = `Pass ${i + 1} · ${pass.name || 'Untitled'}`
        const expanded = open[pass.id] ?? false
        return (
          <section key={pass.id} className="wrSchedBacklogGroup wrPassTasks" aria-label={name}>
            <h4 className="wrSchedSub wrPassTasksHead">
              <span>{name}</span>
              <span className="wrPassTasksMeta">{all.length} open{pass.end ? ` · due ${dayName(pass.end)}` : ''}</span>
            </h4>
            {shown.length === 0 && <p className="wrMuted">Every flag of this pass is resolved.</p>}
            {(expanded ? shown : shown.slice(0, SHOWN)).map(f => {
              const where = f.scope === 'project' ? 'The project' : f.chapterId ? whereOf(f.chapterId) : ''
              const text = f.scope === 'project' ? f.note || 'The project' : f.stale ? `Text gone: “${f.snippet}”` : `“${f.snippet}”`
              const row = (
                <>
                  <span className="wrPassKind">{kindLabel(f.type)}</span>
                  <span className="wrPassWhere">{where}</span>
                  <span className="wrPassQuote">{text}</span>
                </>
              )
              return f.chapterId && onOpenChapter
                ? <button key={f.id} type="button" className="wrPassTask" title="Open the chapter" onClick={() => onOpenChapter(f.chapterId as string)}>{row}</button>
                : <div key={f.id} className="wrPassTask">{row}</div>
            })}
            {!expanded && shown.length > SHOWN && (
              <button type="button" className="wrSmallBtn wrPassMore" onClick={() => setOpen(prev => ({ ...prev, [pass.id]: true }))}>{shown.length - SHOWN} more</button>
            )}
          </section>
        )
      })}
    </>
  )
}

export default PassBacklog
