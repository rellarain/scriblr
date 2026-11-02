import { useState } from 'react'
import { FACETS, FACET_LABEL, FACET_UNIT, unitOf, type Facet, type Goal, type Planner } from '../../../../lib/facets'
import type { TreeNodeFact } from '../../../../lib/goalFacts'
import type { GoalProgress, GoalStatus } from '../../../../lib/projection'
import { newId } from './ids'
import { FacetIcon } from './FacetIcon'
import { IconBtn } from './IconBtn'
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from '../../../icons'

// Goals for each facet: a daily and a weekly target, a total (with a deadline), for the whole project, a book or a chapter. Each shows how far it
// is, today's and the week's progress, and whether the pace of the last 28 days makes the deadline.

export interface Stat { value: string; label: string }
export interface GoalOwner { id: string; label: string; planner: Planner; setPlanner: (p: Planner) => void }
export interface OwnedProgress { ownerId: string; p: GoalProgress }
const STATUS: Record<GoalStatus, { glyph: string; label: string }> = {
  ahead: { glyph: '▲', label: 'Ahead' },
  track: { glyph: '●', label: 'On track' },
  behind: { glyph: '▼', label: 'Behind' },
  done: { glyph: '✓', label: 'Done' },
}
const n = (v: number): string => Math.round(v).toLocaleString('en-US')
const dateLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function goalTitle(goal: Goal, nodes: TreeNodeFact[]): string {
  const scope = goal.scope === 'project' ? '' : ` · ${nodes.find(x => x.id === goal.nodeId)?.title ?? goal.scope}`
  return `${FACET_LABEL[goal.facet]}${goal.kind ? ` ${goal.kind}s` : ''}${scope}`
}

function OptionalNumber({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="wrKv">
      <span>{label}</span>
      <input className="wrField wrSchedNum" type="number" min={0} aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} />
    </label>
  )
}

function GoalEditor({ goal, nodes, scoped, onSave, onCancel }: { goal: Goal; nodes: TreeNodeFact[]; scoped: boolean; onSave: (g: Goal) => void; onCancel: () => void }) {
  const [g, setG] = useState(goal)
  const pickable = nodes.filter(x => (g.scope === 'book' ? x.kind === 'book' : x.kind === 'chapter'))
  const set = (patch: Partial<Goal>) => setG(prev => ({ ...prev, ...patch }))
  return (
    <form className="wrSchedForm" onSubmit={e => { e.preventDefault(); onSave(g) }}>
      <label className="wrKv"><span>Facet</span>
        <select className="wrField" aria-label="Facet" value={g.facet} onChange={e => set({ facet: e.target.value as Facet, kind: null })}>
          {FACETS.map(f => <option key={f} value={f}>{FACET_LABEL[f]}</option>)}
        </select>
      </label>
      {scoped && (g.facet === 'draft' || g.facet === 'outline') && (
        <label className="wrKv"><span>For</span>
          <select className="wrField" aria-label="Scope" value={g.scope} onChange={e => set({ scope: e.target.value as Goal['scope'], nodeId: null })}>
            <option value="project">The whole project</option><option value="book">A book</option><option value="chapter">A chapter</option>
          </select>
        </label>
      )}
      {scoped && g.scope !== 'project' && (
        <label className="wrKv"><span>{g.scope === 'book' ? 'Book' : 'Chapter'}</span>
          <select className="wrField" aria-label={g.scope === 'book' ? 'Book' : 'Chapter'} value={g.nodeId ?? ''} onChange={e => set({ nodeId: e.target.value || null })}>
            <option value="">Choose…</option>{pickable.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </label>
      )}
      <OptionalNumber label={`A day (${FACET_UNIT[g.facet].many})`} value={g.daily} onChange={v => set({ daily: v })} />
      <OptionalNumber label={`A week (${FACET_UNIT[g.facet].many})`} value={g.weekly} onChange={v => set({ weekly: v })} />
      <OptionalNumber label={`In all (${FACET_UNIT[g.facet].many})`} value={g.total} onChange={v => set({ total: v })} />
      <label className="wrKv"><span>Deadline</span>
        <input className="wrField" type="date" aria-label="Deadline" value={g.deadline ?? ''} onChange={e => set({ deadline: e.target.value || null })} />
      </label>
      <div className="wrSchedFormActions">
        <IconBtn Icon={CloseIcon} label="Cancel" onClick={onCancel} />
        <IconBtn type="submit" Icon={CheckIcon} label="Save goal" className="wrSmallBtn wrSmallBtn--accent" disabled={scoped && g.scope !== 'project' && !g.nodeId} />
      </div>
    </form>
  )
}

export function GoalsCard({
  owners, progress, stats, nodes, scoped,
}: { owners: GoalOwner[]; progress: OwnedProgress[]; stats: Stat[]; nodes: TreeNodeFact[]; scoped: boolean }) {
  const [editing, setEditing] = useState<{ goal: Goal; ownerId: string; isNew: boolean } | null>(null)
  const owner = (id: string) => owners.find(o => o.id === id) as GoalOwner
  const save = (g: Goal, ownerId: string) => {
    const o = owner(ownerId)
    const exists = o.planner.goals.some(x => x.id === g.id)
    o.setPlanner({ ...o.planner, goals: exists ? o.planner.goals.map(x => (x.id === g.id ? g : x)) : [...o.planner.goals, g] })
    setEditing(null)
  }
  const many = owners.length > 1
  const fresh = (): Goal => ({ id: newId('goal'), facet: 'draft', scope: 'project', nodeId: null, kind: null, daily: null, weekly: null, total: null, deadline: null })
  const books = progress.filter(x => x.p.goal.scope === 'book')
  return (
    <div className="wrSchedCard wrSchedGoals">
      <div className="wrSchedHead">
        <span className="wrSchedSpacer" />
        <IconBtn Icon={PlusIcon} label="New goal" className="wrSmallBtn wrSmallBtn--accent" onClick={() => setEditing({ goal: fresh(), ownerId: owners[0].id, isNew: true })} />
      </div>
      <div className="wrStatRow">{stats.map(s => <div key={s.label}><strong>{s.value}</strong><span>{s.label}</span></div>)}</div>
      {editing && (
        <>
          {many && editing.isNew && (
            <label className="wrKv"><span>Goal for</span>
              <select className="wrField" aria-label="Goal for" value={editing.ownerId} onChange={e => setEditing({ ...editing, ownerId: e.target.value })}>{owners.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
            </label>
          )}
          <GoalEditor key={editing.goal.id} goal={editing.goal} nodes={nodes} scoped={scoped && !(many && editing.ownerId === owners[0].id)} onSave={g => save(g, editing.ownerId)} onCancel={() => setEditing(null)} />
        </>
      )}
      {progress.length === 0 && !editing && <p className="wrMuted">No goals yet. Add a daily, weekly or total goal for any facet, with a deadline if it has one.</p>}
      {progress.map(({ ownerId, p }) => {
        const unit = unitOf(p.goal.facet, 2)
        const s = p.status ? STATUS[p.status] : null
        return (
          <div className="wrSchedGoal" key={p.goal.id}>
            <div className="wrSchedGoalTop">
              <FacetIcon facet={p.goal.facet} />
              <strong>{goalTitle(p.goal, nodes)}{many ? ` · ${owner(ownerId).label}` : ''}</strong>
              {s && <span className={`wrSchedChip wrSchedChip--${p.status}`}>{s.glyph} {s.label}</span>}
              {p.pct !== null && <span className="wrSchedPct">{p.pct}%</span>}
            </div>
            {p.pct !== null && <div className="wrBarTrack" role="img" aria-label={`${goalTitle(p.goal, nodes)} ${p.pct} percent done`}><div className="wrBarFill" style={{ width: `${p.pct}%`, background: `var(--wr-f-${p.goal.facet})` }} /></div>}
            <div className="wrSchedGoalMeta">
              {p.goal.daily !== null && <span>Today {n(p.today)} of {n(p.goal.daily)}</span>}
              {p.goal.weekly !== null && <span>Week {n(p.week)} of {n(p.goal.weekly)}</span>}
              {p.goal.total !== null && <span>{n(p.current)} of {n(p.goal.total)} {unit}</span>}
            </div>
            {p.deadline && p.daysLeft !== null && (
              <div className="wrSchedGoalDue wrMuted">
                Due {dateLabel(p.deadline)} · {p.daysLeft >= 0 ? `${p.daysLeft} days left` : `${-p.daysLeft} days past`}
                {p.needed !== null && p.status !== 'done' ? ` · needs ${n(p.needed)} a day, pace is ${n(p.pace)}` : ''}
              </div>
            )}
            {!p.deadline && p.finishes && p.status !== 'done' && <div className="wrSchedGoalDue wrMuted">At the last 28 days&rsquo; pace: {dateLabel(p.finishes)}</div>}
            <div className="wrSchedGoalActions">
              <IconBtn Icon={PencilIcon} label="Edit goal" onClick={() => setEditing({ goal: p.goal, ownerId, isNew: false })} />
              <IconBtn Icon={TrashIcon} label="Remove goal" onClick={() => owner(ownerId).setPlanner({ ...owner(ownerId).planner, goals: owner(ownerId).planner.goals.filter(x => x.id !== p.goal.id) })} />
            </div>
          </div>
        )
      })}
      {books.length > 0 && (
        <>
          <h3 className="wrSchedSub">By book</h3>
          {books.map(({ p }) => p.pct !== null && (
            <div className="wrSchedBookRow" key={p.goal.id}>
              <span>{goalTitle(p.goal, nodes)}</span>
              <div className="wrBarTrack"><div className="wrBarFill" style={{ width: `${p.pct}%`, background: `var(--wr-f-${p.goal.facet})` }} /></div>
              <span>{p.pct}%</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
