import { useState } from 'react'
import { useChannels } from '../../../channels/channelStore'
import { childrenOf, labelOf } from '../../../channels/channelTree'
import ActingAs from '../../../feedback/ActingAs'
import '../../../feedback/feedback.scss'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, RestoreIcon } from '../../icons'
import { clearQueueError, loadQueues, setQueueOverride, setQueueRanges, setQueueSwitch, useQueues } from '../../../support/supportStores'
import { EVENT_LABEL, LEVEL_LABEL, LEVELS, STAGE_LABEL, type LevelRanges, type QueueLevel, type QueueRow, type SwitchState } from '../../../support/supportTypes'
import './queue.scss'

// The Queue console (support/supportStores.ts useQueues; backend storage/queues.py). For everyone: their helper time now and the
// switchboard, a switch per console queue where they have a tier (required ones are on and cannot be turned off; without helper time
// all are off). For admins also each queue's people (active, idle, inactive), its chats in progress (never their messages), who is
// waiting, and, for its channel support, the level ranges and a temporary override.

const RANGE_KEYS: Array<keyof LevelRanges> = ['medium', 'high', 'urgent']
const SWITCH_TITLE: Record<SwitchState, string> = {
  required: 'Required at this level for your tier', on: 'On: you take chats from it', off: 'Off', unavailable: 'No helper time now',
}
const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
const since = (iso: string) => { const m = minutesSince(iso); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min` }

function LevelChip({ level }: { level: QueueLevel }) {
  return <span className={`qLevel qLevel--${level}`}>{LEVEL_LABEL[level]}</span>
}

function Switch({ row, label }: { row: QueueRow; label: string }) {
  const state = row.myState as SwitchState
  const on = state === 'required' || state === 'on'
  const locked = state === 'required' || state === 'unavailable'
  return (
    <button
      type="button" role="switch" aria-checked={on} disabled={locked} className={`qSwitch qSwitch--${state}`}
      aria-label={`Take chats from ${label}`} title={SWITCH_TITLE[state]} onClick={() => void setQueueSwitch(row.id, !on)}
    ><span className="qKnob" /></button>
  )
}

// Steppers for a set of ranges, each kept between its neighbours.
function RangeSteppers({ ranges, label, onChange }: { ranges: LevelRanges; label: string; onChange: (r: LevelRanges) => void }) {
  const lowest = (k: keyof LevelRanges) => (k === 'medium' ? 1 : ranges[RANGE_KEYS[RANGE_KEYS.indexOf(k) - 1]] + 1)
  const highest = (k: keyof LevelRanges) => (k === 'urgent' ? 999 : ranges[RANGE_KEYS[RANGE_KEYS.indexOf(k) + 1]] - 1)
  return (
    <div className="qRanges" role="group" aria-label={label}>
      {RANGE_KEYS.map(k => (
        <div key={k} className="qStep" role="group" aria-label={`${LEVEL_LABEL[k]} from`}>
          <span className="qStepLabel">{LEVEL_LABEL[k]} from</span>
          <button type="button" className="fbIconBtn" aria-label={`Lower ${LEVEL_LABEL[k]} from`} title="Fewer waiting" disabled={ranges[k] <= lowest(k)} onClick={() => onChange({ ...ranges, [k]: ranges[k] - 1 })}><ChevronLeftIcon size={12} /></button>
          <span className="qStepValue" aria-live="polite">{ranges[k]}</span>
          <button type="button" className="fbIconBtn" aria-label={`Raise ${LEVEL_LABEL[k]} from`} title="More waiting" disabled={ranges[k] >= highest(k)} onClick={() => onChange({ ...ranges, [k]: ranges[k] + 1 })}><ChevronRightIcon size={12} /></button>
        </div>
      ))}
    </div>
  )
}

function QueueDetails({ row, label }: { row: QueueRow; label: string }) {
  const { index } = useChannels()
  const [hours, setHours] = useState(4)
  return (
    <details className="qCard">
      <summary>
        <span className="qName">{label}</span>
        <LevelChip level={row.level} />
        <span className="fbMuted" title="Waiting">{row.pending} waiting</span>
        <span className="fbMuted" title="In progress">{row.chats.length} in progress</span>
      </summary>
      <h4 className="fbLabel">People</h4>
      <ul className="qPeople" aria-label={`People on ${label}`}>
        {row.staff.map(s => <li key={s.id}><span>{s.name}</span><span className="fbMuted">Tier {s.tier}</span><span className={`qState qState--${s.state}`}>{s.state === 'active' ? 'Active' : s.state === 'idle' ? 'Idle' : 'Inactive'}</span></li>)}
      </ul>
      {row.chats.length > 0 && (
        <>
          <h4 className="fbLabel">In progress</h4>
          <table className="qTable" aria-label={`Chats in progress on ${label}`}>
            <thead><tr><th scope="col">Staff</th><th scope="col">Writer</th><th scope="col">Feature</th><th scope="col">Stage</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {row.chats.map(c => (
                <tr key={c.id}>
                  <td>{c.staffName}</td>
                  <td>{c.userName || 'A writer'}<span className="fbMuted"> · tier {c.tier}</span></td>
                  <td>{labelOf(index, c.focal)}</td>
                  <td>{STAGE_LABEL[c.stage]}</td>
                  <td title={c.actions.map(a => EVENT_LABEL[a]).join(', ')}>{c.actions.length ? EVENT_LABEL[c.actions[c.actions.length - 1]] : ''}<span className="fbMuted"> ({c.actions.length})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {row.waiting.length > 0 && (
        <>
          <h4 className="fbLabel">Waiting</h4>
          <ul className="qPeople" aria-label={`Waiting on ${label}`}>
            {row.waiting.map(w => <li key={w.id}><span>{w.userName || 'A writer'}</span><span className="fbMuted">{labelOf(index, w.focal)} · tier {w.tier}</span><span className="fbMuted">{since(w.waitingSince)}</span></li>)}
          </ul>
        </>
      )}
      {row.canManage && (
        <>
          <h4 className="fbLabel">Levels</h4>
          <RangeSteppers ranges={row.ranges} label={`Levels of ${label}`} onChange={r => void setQueueRanges(row.id, r)} />
          {row.ownRanges && <button type="button" className="fbIconBtn" aria-label={`Use the default levels on ${label}`} title="Use the default levels" onClick={() => void setQueueRanges(row.id, null)}><RestoreIcon size={12} /></button>}
          <div className="fbRow">
            <select className="fbSelect" aria-label={`Raise the level of ${label}`} value={row.override?.level ?? ''} onChange={e => void setQueueOverride(row.id, (e.target.value || null) as QueueLevel | null, hours)}>
              <option value="">No override</option>
              {LEVELS.filter(l => l !== 'low').map(l => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
            </select>
            <div className="qStep" role="group" aria-label="Override hours">
              <button type="button" className="fbIconBtn" aria-label="Fewer override hours" title="Shorter" disabled={hours <= 1} onClick={() => setHours(h => h - 1)}><ChevronLeftIcon size={12} /></button>
              <span className="qStepValue" aria-live="polite">{hours} h</span>
              <button type="button" className="fbIconBtn" aria-label="More override hours" title="Longer" disabled={hours >= 24} onClick={() => setHours(h => h + 1)}><ChevronRightIcon size={12} /></button>
            </div>
            {row.override && <span className="fbMuted">until {new Date(row.override.until).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
          </div>
        </>
      )}
    </details>
  )
}

function QueueSection() {
  const { index } = useChannels()
  const { view, status, error } = useQueues()
  if (!view) {
    return (
      <div className="queueSection fbScope">
        {status === 'error'
          ? <p className="fbError" role="alert">{error} <button type="button" className="fbIconBtn" onClick={() => void loadQueues()}>Retry</button></p>
          : <p className="fbMuted">Loading…</p>}
      </div>
    )
  }
  const label = (id: string) => labelOf(index, id)
  const mine = view.queues.filter(q => q.myState !== null)
  const byInterface = childrenOf(index, null).map(i => ({ i, rows: mine.filter(q => q.id.split('/')[0] === i.id) })).filter(g => g.rows.length > 0)
  const { me } = view
  return (
    <div className="queueSection fbScope">
      <div className="queueScroll">
        <div className="fbBar"><ActingAs /></div>
        {error && <p className="fbError" role="alert">{error} <button type="button" className="fbIconBtn" aria-label="Dismiss" title="Dismiss" onClick={clearQueueError}><CloseIcon size={12} /></button></p>}
        <p className="qMe">
          <strong>{me.name}</strong>
          <span className={me.onShift ? 'qShift qShift--on' : 'qShift'}>{me.onShift ? 'On shift' : 'Off shift'}</span>
          {me.allotment ? <span className="fbMuted">{me.thisWeek.hours} of {me.allotment} h this week</span> : null}
        </p>
        <section className="qBoard" aria-label="Switchboard">
          {byInterface.map(({ i, rows }) => (
            <div key={i.id} className="qGroup">
              <h3 className="fbLabel">{i.name}</h3>
              {rows.map(q => (
                <div key={q.id} className="qRow">
                  <span className="qName">{childrenOf(index, i.id).find(n => n.id === q.id)?.name ?? q.id}</span>
                  <span className="fbMuted" title={`Your tier on ${label(q.id)}`}>T{q.myTier}</span>
                  <LevelChip level={q.level} />
                  <span className="qCount" title="Waiting">{q.pending}</span>
                  <Switch row={q} label={label(q.id)} />
                </div>
              ))}
            </div>
          ))}
          {byInterface.length === 0 && <p className="fbMuted">No queues.</p>}
        </section>
        {me.kind === 'admin' && (
          <section className="qAdmin" aria-label="Queues">
            <h3 className="fbLabel">Queues</h3>
            {me.managesAny && <RangeSteppers ranges={view.levels} label="Default levels" onChange={r => void setQueueRanges(null, r)} />}
            {view.queues.map(q => <QueueDetails key={q.id} row={q} label={label(q.id)} />)}
          </section>
        )}
      </div>
    </div>
  )
}

export default QueueSection
