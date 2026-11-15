import { useState, type ReactNode } from 'react'
import {
  CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, HandIcon, PlayIcon, PlusIcon, RestoreIcon, TrashIcon,
} from '../../../icons'
import { useChannels } from '../../../../channels/channelStore'
import { childrenOf as channelChildren, labelOf } from '../../../../channels/channelTree'
import ActingAs from '../../../../feedback/ActingAs'
import { staffFeedbackApi } from '../../../../feedback/feedbackApi'
import { scopeOf } from '../../../../feedback/feedbackLogic'
import StatementCard from '../../../../feedback/StatementCard'
import type { MessageActions } from '../../../../feedback/MessageCard'
import type { StaffBundle, Statement } from '../../../../feedback/feedbackTypes'
import { changeStaff, useStaff } from '../../../../feedback/staffStore'
import '../../../../feedback/feedback.scss'
import { RepeatPicker } from '../../writer/schedule/RepeatPicker'
import { beginPointerDrag, zoneRef } from '../../../../lib/pointerDrag'
import { planApi } from '../../../../plan/planApi'
import {
  HOLDS, KIND_LABEL, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, TOP_KINDS, boardColumns, childrenOf, movedBefore, myWork, nextStatus,
  openCounts, progressOf, timeline,
} from '../../../../plan/planLogic'
import type { ItemPatch, PlanItem, PlanKind, PlanStatus, PlanView } from '../../../../plan/planTypes'
import { changePlan, clearPlanError, loadPlan, usePlan } from '../../../../plan/projectPlanStore'
import { ReorderList } from '../characters/ReorderList'
import './plan.scss'

// Admin > Project Plan, four pages over one plan (plan/projectPlanStore.ts): **Plan** (the channel list, and for the node chosen its
// feedback statements, to accept or veto, and its procedures, processes, tasks and routines), **My work** (what is mine, what I
// could claim, what I finished), **Timeline** (dated items as bars by node) and **Board** (items by status; drag a card to move it).
// Everything acts as the staff member chosen in the Acting as chip.

function localDay(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const edit = (id: string, patch: ItemPatch) => changePlan(a => planApi.edit(a, id, patch))
const messageActions: MessageActions = {
  ask: (id, text) => changeStaff(a => staffFeedbackApi.ask(a, id, text)),
  comment: (id, text) => changeStaff(a => staffFeedbackApi.comment(a, id, text)),
}

// The plan and the feedback, loaded; the bar with what the page adds and the Acting as chip; the refusal note.
function Frame({ label, bar, children }: { label: string; bar?: ReactNode; children: (view: PlanView, bundle: StaffBundle | null) => ReactNode }) {
  const { view, status, error } = usePlan()
  const { bundle } = useStaff()
  if (!view) {
    return (
      <div className="plPage fbScope" aria-label={label}>
        {status === 'error'
          ? <p className="fbError" role="alert">{error} <button type="button" className="fbIconBtn" onClick={() => void loadPlan()}>Retry</button></p>
          : <p className="fbMuted">Loading…</p>}
      </div>
    )
  }
  return (
    <div className="plPage fbScope" aria-label={label}>
      <div className="fbBar">{bar}<ActingAs /></div>
      {error && (
        <p className="fbError" role="alert">
          {error} <button type="button" className="fbIconBtn" aria-label="Dismiss" title="Dismiss" onClick={clearPlanError}>×</button>
        </p>
      )}
      {children(view, bundle)}
    </div>
  )
}

const nameOf = (bundle: StaffBundle | null, id: string | undefined | null) => (id ? bundle?.admins.find(a => a.id === id)?.name ?? id : '')

// --- one item, in the node's plan --------------------------------------------------------------------------------------

function ItemRow({ item, items, bundle, grip }: { item: PlanItem; items: PlanItem[]; bundle: StaffBundle | null; grip: ReactNode }) {
  const { index } = useChannels()
  const [title, setTitle] = useState(item.title)
  const [open, setOpen] = useState(item.kind !== 'task')
  const can = item.can
  const progress = progressOf(items, item.id)
  const holds = HOLDS[item.kind]
  const statements = item.statementIds.map(id => bundle?.statements.find(s => s.id === id)).filter((s): s is Statement => !!s)
  const add = (kind: PlanKind) => changePlan(a => planApi.add(a, {
    nodeId: item.nodeId, kind, parentId: item.id, title: `New ${KIND_LABEL[kind].toLowerCase()}`, ordered: true,
  }))
  const saveTitle = () => { if (title.trim() && title !== item.title) void edit(item.id, { title }); else setTitle(item.title) }

  return (
    <div className={`plItem plItem--${item.kind} plItem--${item.status}`} aria-label={`${KIND_LABEL[item.kind]}: ${item.title}`} role="group">
      <div className="plItemHead">
        {can.edit && grip}
        {holds.length > 0 && (
          <button type="button" className="fbIconBtn plFold" aria-expanded={open} aria-label={open ? `Fold ${item.title}` : `Unfold ${item.title}`} title={open ? 'Fold' : 'Unfold'} onClick={() => setOpen(o => !o)}>
            {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
          </button>
        )}
        <span className="plKind">{KIND_LABEL[item.kind]}</span>
        <input
          className="fbField plTitle" value={title} disabled={!can.edit} maxLength={200} aria-label={`Title of ${item.title}`}
          onChange={e => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setTitle(item.title) }}
        />
        {progress && <span className="plProgress" title="Tasks done">{progress.done}/{progress.total}</span>}
        {can.edit && (
          <button type="button" className="fbIconBtn" aria-label={`Delete ${item.title}`} title="Delete it and everything in it" onClick={() => void changePlan(a => planApi.remove(a, item.id))}>
            <TrashIcon size={14} />
          </button>
        )}
      </div>
      <div className="plItemFields">
        <select className="fbSelect" value={item.status} disabled={!can.status && !can.claim} aria-label={`Status of ${item.title}`} onChange={e => void edit(item.id, { status: e.target.value as PlanStatus })}>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select className="fbSelect" value={item.priority} disabled={!can.edit} aria-label={`Priority of ${item.title}`} onChange={e => void edit(item.id, { priority: e.target.value as PlanItem['priority'] })}>
          {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
        <select className="fbSelect" value={item.assignee?.id ?? ''} disabled={!can.edit} aria-label={`Assigned to, ${item.title}`} onChange={e => void edit(item.id, { assigneeId: e.target.value || null })}>
          <option value="">Nobody</option>
          {(bundle?.admins ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" className="fbSelect" value={item.start ?? ''} disabled={!can.edit} aria-label={`Start of ${item.title}`} onChange={e => void edit(item.id, { start: e.target.value || null })} />
        <input type="date" className="fbSelect" value={item.due ?? ''} disabled={!can.edit} aria-label={`Due date of ${item.title}`} onChange={e => void edit(item.id, { due: e.target.value || null })} />
        {holds.length > 0 && (
          <button type="button" className="fbIconBtn" aria-pressed={item.ordered} disabled={!can.edit} aria-label={`In order, ${item.title}`} title={item.ordered ? 'Done in order' : 'Done in any order'} onClick={() => void edit(item.id, { ordered: !item.ordered })}>
            1·2·3
          </button>
        )}
        {item.claimedBy && <span className="fbMuted">Claimed by {nameOf(bundle, item.claimedBy)}</span>}
        {can.claim && (
          <button type="button" className="fbIconBtn" aria-label={`Claim ${item.title}`} title="Claim it" onClick={() => void changePlan(a => planApi.claim(a, item.id))}>
            <HandIcon size={14} />
          </button>
        )}
      </div>
      {item.kind === 'routine' && item.recurrence && can.edit && (
        <RepeatPicker value={item.recurrence} anchor={item.recurrence.anchor} label={`Repeat ${item.title}`} allowInterval onChange={r => void edit(item.id, { recurrence: r })} />
      )}
      {statements.length > 0 && (
        <div className="plLinks" aria-label="Answers">
          {statements.map(s => <span key={s.id} className="fbBadge" title="A feedback statement it answers">{s.verbName} {labelOf(index, s.channelId)}</span>)}
        </div>
      )}
      {open && holds.length > 0 && (
        <div className="plChildren">
          <ItemList nodeId={item.nodeId} parentId={item.id} items={items} bundle={bundle} />
          {can.edit && (
            <div className="fbRow">
              {holds.map(k => (
                <button key={k} type="button" className="fbIconBtn" aria-label={`Add a ${k} to ${item.title}`} title={`Add a ${k}`} onClick={() => void add(k)}>
                  <PlusIcon size={12} /> {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ItemList({ nodeId, parentId, items, bundle }: { nodeId: string; parentId: string | null; items: PlanItem[]; bundle: StaffBundle | null }) {
  const level = childrenOf(items, nodeId, parentId)
  if (level.length === 0) return null
  return (
    <ReorderList
      items={level} className="plList" label={i => i.title}
      onMove={(id, before) => void changePlan(a => planApi.reorder(a, nodeId, parentId, movedBefore(level.map(i => i.id), id, before)))}
      render={(item, grip) => <ItemRow item={item} items={items} bundle={bundle} grip={grip} />}
    />
  )
}

// --- a node's statements ---------------------------------------------------------------------------------------------------

function Decide({ statement, nodeId, canPlan }: { statement: Statement; nodeId: string; canPlan: boolean }) {
  const { index } = useChannels()
  const [note, setNote] = useState(statement.decisionNote)
  const reason = `Deciding needs the Planner role on ${labelOf(index, scopeOf(statement.channelId))}.`
  const decide = async (decision: 'accepted' | 'vetoed' | null) => {
    const ok = await changeStaff(a => staffFeedbackApi.decide(a, statement.id, decision, decision ? note : ''))
    // Accepted: it becomes plan work, a task that answers it.
    if (ok && decision === 'accepted' && canPlan) {
      await changePlan(a => planApi.add(a, { nodeId, kind: 'task', title: `${statement.verbName} ${labelOf(index, statement.channelId)}`, statementIds: [statement.id] }))
    }
  }
  if (statement.decision) {
    return (
      <div className="fbRow">
        {statement.decisionNote && <span className="fbMuted">{statement.decisionNote}</span>}
        <button type="button" className="fbIconBtn" disabled={!statement.can.decide} aria-label={`Undo the decision on ${statement.verbName}`} title={statement.can.decide ? 'Put it back in voting' : reason} onClick={() => void decide(null)}>
          <RestoreIcon size={14} />
        </button>
      </div>
    )
  }
  return (
    <div className="fbRow">
      <input className="fbField" value={note} maxLength={500} disabled={!statement.can.decide} aria-label={`Note on the decision, ${statement.verbName}`} placeholder="Why (the writers see it)…" onChange={e => setNote(e.target.value)} />
      <button type="button" className="fbIconBtn fbIconBtn--primary" disabled={!statement.can.decide} aria-label={`Accept ${statement.verbName}`} title={statement.can.decide ? 'Accept: it becomes plan work' : reason} onClick={() => void decide('accepted')}>
        <CheckIcon size={14} />
      </button>
      <button type="button" className="fbIconBtn" disabled={!statement.can.decide} aria-label={`Veto ${statement.verbName}`} title={statement.can.decide ? 'Veto, with the note' : reason} onClick={() => void decide('vetoed')}>
        <CloseIcon size={14} />
      </button>
    </div>
  )
}

// --- the channel tree ------------------------------------------------------------------------------------------------------

function ChannelTree({ at, onPick, counts, statements }: { at: string | null; onPick: (id: string) => void; counts: Map<string, number>; statements: Map<string, number> }) {
  const { index } = useChannels()
  const [shut, setShut] = useState<Set<string>>(() => new Set())
  const level = (parent: string | null): ReactNode => {
    const nodes = channelChildren(index, parent)
    if (nodes.length === 0) return null
    return (
      <ul role={parent ? 'group' : 'tree'} aria-label={parent ? undefined : 'Parts of the app'} className="plTreeList">
        {nodes.map(n => {
          const kids = channelChildren(index, n.id).length > 0
          const open = !shut.has(n.id)
          const c = counts.get(n.id) ?? 0, s = statements.get(n.id) ?? 0
          return (
            <li key={n.id} role="treeitem" aria-selected={at === n.id} aria-expanded={kids ? open : undefined}>
              <div className={`plTreeRow${at === n.id ? ' plTreeRow--on' : ''}`}>
                {kids
                  ? <button type="button" className="plTreeFold" aria-label={open ? `Fold ${n.name}` : `Unfold ${n.name}`} onClick={() => setShut(p => { const x = new Set(p); if (open) x.add(n.id); else x.delete(n.id); return x })}>{open ? <ChevronDownIcon size={10} /> : <ChevronRightIcon size={10} />}</button>
                  : <span className="plTreeFold" />}
                <button type="button" className="plTreeName" onClick={() => onPick(n.id)}>{n.name}</button>
                {s > 0 && <span className="plCount plCount--statements" title="Statements in voting">{s}</span>}
                {c > 0 && <span className="plCount" title="Open plan items">{c}</span>}
              </div>
              {kids && open && level(n.id)}
            </li>
          )
        })}
      </ul>
    )
  }
  return <nav className="plTree">{level(null)}</nav>
}

export function NodePlanPage() {
  const { index } = useChannels()
  const [at, setAt] = useState<string | null>(null)
  return (
    <Frame label="Plan">
      {(view, bundle) => {
        const counts = openCounts(view.items)
        const waiting = new Map<string, number>()
        for (const s of bundle?.statements ?? []) if (!s.decision) waiting.set(s.channelId, (waiting.get(s.channelId) ?? 0) + 1)
        const node = at ? index.byId.get(at) : null
        const statements = (bundle?.statements ?? []).filter(s => s.channelId === at)
        const me = bundle?.admins.find(a => a.id === bundle.me)
        const canPlan = !!(at && me && (me.roles[scopeOf(at)] ?? []).includes('planner'))
        const addTop = (kind: PlanKind) => at && changePlan(a => planApi.add(a, {
          nodeId: at, kind, title: `New ${KIND_LABEL[kind].toLowerCase()}`,
          recurrence: kind === 'routine' ? { kind: 'weekly', every: 1, unit: 'day', days: [0], rangeMax: null, anchor: localDay(), until: null } : null,
        }))
        return (
          <div className="plSplit">
            <ChannelTree at={at} onPick={setAt} counts={counts} statements={waiting} />
            <section className="plNode" aria-label={node ? `Plan of ${labelOf(index, node.id)}` : 'Plan'}>
              {!node && <p className="fbMuted">Choose a part of the app.</p>}
              {node && (
                <>
                  <h3 className="plNodeTitle">{labelOf(index, node.id)}</h3>
                  {statements.length > 0 && (
                    <div className="fbList" aria-label="Statements">
                      {[...statements].sort((a, b) => Number(!!a.decision) - Number(!!b.decision)).map(s => bundle && (
                        <StatementCard key={s.id} statement={s} bundle={bundle} actions={messageActions}>
                          <Decide statement={s} nodeId={node.id} canPlan={canPlan} />
                        </StatementCard>
                      ))}
                    </div>
                  )}
                  <ItemList nodeId={node.id} parentId={null} items={view.items} bundle={bundle} />
                  {canPlan && (
                    <div className="fbRow">
                      {TOP_KINDS.map(k => (
                        <button key={k} type="button" className="fbIconBtn" aria-label={`Add a ${k}`} title={`Add a ${k}`} onClick={() => void addTop(k)}>
                          <PlusIcon size={12} /> {KIND_LABEL[k]}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )
      }}
    </Frame>
  )
}

// --- a compact card (My work, the Board) ---------------------------------------------------------------------------------

function ItemCard({ item, bundle, children }: { item: PlanItem; bundle: StaffBundle | null; children?: ReactNode }) {
  const { index } = useChannels()
  return (
    <article className={`plCard plCard--${item.priority}`} aria-label={item.title} data-plan-card={item.id}>
      <div className="plCardTitle">{item.title}</div>
      <div className="fbMeta">
        <span>{KIND_LABEL[item.kind]} · {labelOf(index, item.nodeId)}</span>
        <span className="plPriority">{PRIORITY_LABEL[item.priority]}</span>
        {item.due && <span title="Due">{item.due}</span>}
        {(item.assignee || item.claimedBy) && <span>{nameOf(bundle, item.claimedBy || item.assignee?.id)}</span>}
      </div>
      {children}
    </article>
  )
}

function Moves({ item }: { item: PlanItem }) {
  const can = item.can
  return (
    <div className="fbRow">
      {can.claim && <button type="button" className="fbIconBtn" aria-label={`Claim ${item.title}`} title="Claim it" onClick={() => void changePlan(a => planApi.claim(a, item.id))}><HandIcon size={14} /></button>}
      {can.status && item.status !== 'inProgress' && item.status !== 'done' && <button type="button" className="fbIconBtn" aria-label={`Start ${item.title}`} title="Start it" onClick={() => void edit(item.id, { status: 'inProgress' })}><PlayIcon size={14} /></button>}
      {can.status && item.status !== 'done' && <button type="button" className="fbIconBtn fbIconBtn--primary" aria-label={`Finish ${item.title}`} title="Done" onClick={() => void edit(item.id, { status: 'done' })}><CheckIcon size={14} /></button>}
      {item.claimedBy && item.status !== 'done' && can.status && <button type="button" className="fbIconBtn" aria-label={`Let go of ${item.title}`} title="Let it go" onClick={() => void changePlan(a => planApi.claim(a, item.id, true))}><CloseIcon size={14} /></button>}
    </div>
  )
}

export function MyWorkPage() {
  return (
    <Frame label="My work">
      {(view, bundle) => {
        const w = myWork(view.items, view.me)
        const list = (label: string, items: PlanItem[], empty: string) => (
          <section className="fbList" aria-label={label}>
            <h3 className="fbLabel">{label} ({items.length})</h3>
            {items.length === 0 && <p className="fbMuted">{empty}</p>}
            {items.map(i => <ItemCard key={i.id} item={i} bundle={bundle}><Moves item={i} /></ItemCard>)}
          </section>
        )
        return (
          <div className="plColumns">
            {list('Mine', w.mine, 'Nothing assigned to you.')}
            {list('To claim', w.open, 'Nothing waiting.')}
            {list('Done', w.done, 'Nothing finished yet.')}
          </div>
        )
      }}
    </Frame>
  )
}

export function TimelinePage() {
  const { index } = useChannels()
  return (
    <Frame label="Timeline">
      {view => {
        const t = timeline(view.items, localDay())
        if (!t) return <p className="fbMuted">No item has a date yet.</p>
        return (
          <div className="plTimeline" role="table" aria-label="Timeline">
            <div className="plTimeRow plTimeScale" role="row">
              <span className="plTimeLabel" role="columnheader" />
              <div className="plTimeTrack" role="columnheader"><span>{t.from}</span><span>{t.to}</span></div>
            </div>
            {t.rows.map(row => (
              <div key={row.nodeId} className="plTimeRow" role="row">
                <span className="plTimeLabel" role="rowheader">{labelOf(index, row.nodeId)}</span>
                <div className="plTimeTrack" role="cell" style={{ height: `${row.lanes * 22 + 2}px` }}>
                  {t.todayAt !== null && <span className="plToday" style={{ left: `${t.todayAt}%` }} title="Today" />}
                  {row.bars.map(b => (
                    <span
                      key={b.item.id} className={`plBar plBar--${b.item.status}`} style={{ left: `${b.left}%`, width: `${b.width}%`, top: `${b.lane * 22 + 2}px` }}
                      title={`${b.item.title}: ${b.item.start ?? b.item.due} to ${b.item.due ?? b.item.start} (${STATUS_LABEL[b.item.status]})`}
                    >
                      {b.item.title}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      }}
    </Frame>
  )
}

export function BoardPage() {
  const [over, setOver] = useState<PlanStatus | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  return (
    <Frame label="Board">
      {(view, bundle) => {
        const cols = boardColumns(view.items.filter(i => i.kind !== 'procedure' && i.kind !== 'process'))
        const move = (id: string, status: PlanStatus) => { const it = view.items.find(i => i.id === id); if (it && it.status !== status) void edit(id, { status }) }
        return (
          <div className="plBoard">
            {STATUSES.map(s => (
              <section
                key={s} className={`plBoardCol${over === s ? ' plBoardCol--over' : ''}`} aria-label={STATUS_LABEL[s]}
                ref={zoneRef('plan-card', { over: () => setOver(s), leave: () => setOver(null), drop: () => { setOver(null); if (dragging) move(dragging, s) } })}
              >
                <h3 className="fbLabel">{STATUS_LABEL[s]} ({cols[s].length})</h3>
                {cols[s].map(i => {
                  const movable = i.can.status || (i.can.claim && s === 'todo')
                  const at = STATUSES.indexOf(s)
                  return (
                    <div
                      key={i.id} className={`plBoardItem${dragging === i.id ? ' plBoardItem--dragging' : ''}`}
                      onPointerDown={e => { if (!movable || (e.target as HTMLElement).closest('button')) return; beginPointerDrag({ kind: 'plan-card', source: e.currentTarget, event: e, onStart: () => setDragging(i.id), onEnd: () => setDragging(null) }) }}
                      style={{ touchAction: movable ? 'none' : undefined }}
                    >
                      <ItemCard item={i} bundle={bundle}>
                        {movable && (
                          <div className="fbRow">
                            <button type="button" className="fbIconBtn" disabled={at === 0} aria-label={`Move ${i.title} back`} title={at > 0 ? `Back to ${STATUS_LABEL[STATUSES[at - 1]]}` : undefined} onClick={() => move(i.id, STATUSES[at - 1])}><ChevronLeftIcon size={14} /></button>
                            <button type="button" className="fbIconBtn" disabled={s === 'done'} aria-label={`Move ${i.title} on`} title={s !== 'done' ? `On to ${STATUS_LABEL[nextStatus(s)]}` : undefined} onClick={() => move(i.id, nextStatus(s))}><ChevronRightIcon size={14} /></button>
                          </div>
                        )}
                      </ItemCard>
                    </div>
                  )
                })}
              </section>
            ))}
          </div>
        )
      }}
    </Frame>
  )
}
