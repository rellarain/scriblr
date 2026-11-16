import { useState } from 'react'
import '../../../feedback/feedback.scss'
import { ChevronLeftIcon, ChevronRightIcon, SaveIcon } from '../../icons'
import { saveSchedule, useQueues } from '../../../support/supportStores'
import { DAY_LABEL, type ScheduleBlock, type ScheduleWeek } from '../../../support/supportTypes'
import './queue.scss'

// Helper > Settings: the staff member's helper time (support/supportStores.ts useQueues; backend storage/queues.py). This week's
// schedule is fixed; next week's is set here, a block a day at most, within the hours the Office allots.

const clock = (h: number) => `${h}:00`
const dateOf = (iso: string, plus: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + plus); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }

function Step({ label, value, onStep, lowerOff, raiseOff }: { label: string; value: string; onStep: (dir: -1 | 1) => void; lowerOff: boolean; raiseOff: boolean }) {
  return (
    <div className="qStep" role="group" aria-label={label}>
      <button type="button" className="fbIconBtn" aria-label={`Lower ${label}`} title="Earlier / fewer" disabled={lowerOff} onClick={() => onStep(-1)}><ChevronLeftIcon size={12} /></button>
      <span className="qStepValue" aria-live="polite">{value}</span>
      <button type="button" className="fbIconBtn" aria-label={`Raise ${label}`} title="Later / more" disabled={raiseOff} onClick={() => onStep(1)}><ChevronRightIcon size={12} /></button>
    </div>
  )
}

function ThisWeek({ week }: { week: ScheduleWeek }) {
  return (
    <section className="qWeek" aria-label="This week">
      <h3 className="fbLabel">This week <span className="fbMuted">from {dateOf(week.start, 0)} · {week.hours} h</span></h3>
      {week.blocks.length === 0 && <p className="fbMuted">No hours.</p>}
      {week.blocks.map(b => <div key={b.day} className="qDay"><span className="qDayName">{DAY_LABEL[b.day]}</span><span>{clock(b.start)}–{clock(b.start + b.hours)}</span></div>)}
    </section>
  )
}

function NextWeek({ week, allotment }: { week: ScheduleWeek; allotment: number }) {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(week.blocks)
  const total = blocks.reduce((n, b) => n + b.hours, 0)
  const changed = JSON.stringify(blocks) !== JSON.stringify(week.blocks) || !week.own
  const set = (day: number, next: ScheduleBlock | null) => setBlocks(prev => [...prev.filter(b => b.day !== day), ...(next ? [next] : [])].sort((a, b) => a.day - b.day))
  return (
    <section className="qWeek" aria-label="Next week">
      <h3 className="fbLabel">Next week <span className="fbMuted">from {dateOf(week.start, 0)}</span></h3>
      {DAY_LABEL.map((name, day) => {
        const b = blocks.find(x => x.day === day)
        return (
          <div key={day} className="qDay">
            <span className="qDayName">{name} <span className="fbMuted">{dateOf(week.start, day)}</span></span>
            <button
              type="button" role="switch" aria-checked={!!b} className="qSwitch" aria-label={`Work on ${name}`} title={b ? 'Working' : 'Off'}
              disabled={!b && total >= allotment}
              onClick={() => set(day, b ? null : { day, start: 9, hours: Math.min(4, allotment - total) })}
            ><span className="qKnob" /></button>
            {b && (
              <>
                <Step label={`${name} start`} value={clock(b.start)} lowerOff={b.start <= 0} raiseOff={b.start + b.hours >= 24} onStep={d => set(day, { ...b, start: b.start + d })} />
                <Step label={`${name} hours`} value={`${b.hours} h`} lowerOff={b.hours <= 1} raiseOff={b.hours >= 12 || b.start + b.hours >= 24 || total >= allotment} onStep={d => set(day, { ...b, hours: b.hours + d })} />
              </>
            )}
          </div>
        )
      })}
      <div className="fbRow">
        <span className={total > allotment ? 'fbError' : 'fbMuted'}>{total} of {allotment} h</span>
        <button type="button" className="fbIconBtn fbIconBtn--primary" disabled={!changed || total > allotment} aria-label="Save next week" title="Save next week" onClick={() => void saveSchedule(blocks)}><SaveIcon size={14} /></button>
      </div>
    </section>
  )
}

function SettingsSection() {
  const { view, error } = useQueues()
  return (
    <div className="queueSection fbScope">
      <div className="queueScroll">
        {error && <p className="fbError" role="alert">{error}</p>}
        {!view ? <p className="fbMuted">Loading…</p> : !view.me.allotment ? (
          <p className="fbMuted">No helper hours are allotted to you.</p>
        ) : (
          <>
            <p className="qMe"><strong>Helper time</strong><span className="fbMuted">{view.me.allotment} h a week</span></p>
            <ThisWeek week={view.me.thisWeek} />
            <NextWeek key={`${view.me.id}|${view.me.nextWeek.start}|${JSON.stringify(view.me.nextWeek.blocks)}|${view.me.nextWeek.own}`} week={view.me.nextWeek} allotment={view.me.allotment} />
          </>
        )}
      </div>
    </div>
  )
}

export default SettingsSection
