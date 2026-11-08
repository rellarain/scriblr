import type { ModelContent } from '../../../../api/types'
import { LIMITS, copyBytes, limitNotes } from './engine/limits'
import { publishFaults } from './modelContent'

// The model's checks in plain words: what stops Publish, which limits it is at or past, and the size of a character's copy of it.
export function CheckPanel({ content }: { content: ModelContent }) {
  const faults = publishFaults(content), notes = limitNotes(content).filter(n => !faults.some(f => f.includes('KB') && n.text.includes('KB')))
  const kb = Math.round(copyBytes(content) / 102.4) / 10
  return (
    <section className="cmCheck" aria-label="Checks">
      <h2 className="cmInsSub">Checks</h2>
      <p className="cmInsText">A character's copy of this model: {kb} KB (warning above {LIMITS.copyWarnBytes / 1024}, stop at {LIMITS.copyMaxBytes / 1024}).</p>
      {faults.length === 0 && notes.length === 0 && <p className="cmInsText" role="status">Nothing to fix: the model can be published.</p>}
      {faults.length > 0 && (
        <>
          <p className="cmInsText"><b>Publish is refused until this is fixed:</b></p>
          <ul className="cmFaults">{faults.map(f => <li key={f} className="cmFaults--stop">{f}</li>)}</ul>
        </>
      )}
      {notes.length > 0 && (
        <ul className="cmFaults">{notes.map(n => <li key={n.text} className={`cmFaults--${n.level}`}><b>{n.level === 'stop' ? 'Stop' : 'Warning'}:</b> {n.text}</li>)}</ul>
      )}
    </section>
  )
}
