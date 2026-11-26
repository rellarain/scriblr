import { useEffect } from 'react'
import { PauseIcon, PlayIcon } from './assets/icons'
import { loadQueues, setOnBreak, useQueues } from './support/supportStores'

// Minutes as "2h 05m", "45m".
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

function Meter({ label, value, max, text, over = false }: { label: string; value: number; max: number; text: string; over?: boolean }) {
  const share = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div className="auiMeter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={text}>
      <span className="auiMeterText">{label}: {text}</span>
      <span className="auiMeterBar" aria-hidden="true">
        <span className={over ? 'auiMeterFill auiMeterFill--over' : 'auiMeterFill'} style={{ width: `${share * 100}%` }} />
      </span>
    </div>
  )
}

// AUI's mini form, in the band under the header while AUI is on (and all of AUI when it is mini): today's work, done against
// what remains of the helper time scheduled, and the break earned by it against the break used, with Start and End break.
// It looks again every minute (the backend works it out from the clock: storage/queues.py work_today).
function AuiMini() {
  const { view, error } = useQueues()
  useEffect(() => {
    const id = window.setInterval(() => { void loadQueues() }, 60_000)
    return () => window.clearInterval(id)
  }, [])
  const work = view?.me.work
  const onShift = !!view?.me.onShift

  return (
    <div className="auiMini" role="group" aria-label="Admin">
      {!work || work.scheduled === 0 ? (
        <span className="auiMiniNote">{view ? 'No helper time today' : error ?? 'Loading…'}</span>
      ) : (
        <>
          <Meter
            label="Work" value={work.complete} max={work.complete + work.remaining}
            text={`${duration(work.complete)} done, ${duration(work.remaining)} to go`}
          />
          <Meter
            label="Break" value={work.breakUsed} max={work.breakEarned} over={work.breakUsed > work.breakEarned}
            text={`${duration(work.breakUsed)} of ${duration(work.breakEarned)} earned`}
          />
          <button
            type="button" className={work.onBreak ? 'bandToggle bandToggle--active' : 'bandToggle'}
            aria-pressed={work.onBreak} disabled={!work.onBreak && !onShift}
            aria-label={work.onBreak ? 'End the break' : 'Start a break'}
            title={work.onBreak ? 'End the break: back to taking chats' : onShift ? 'Start a break: no new chats come to you' : 'No helper time now'}
            onClick={() => void setOnBreak(!work.onBreak)}
          >
            {work.onBreak ? <PlayIcon size={21} /> : <PauseIcon size={21} />}
          </button>
        </>
      )}
    </div>
  )
}

export default AuiMini
