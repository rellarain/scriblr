import type { ModelContent } from '../../../../api/types'
import { LIMITS, copyBytes, limitNotes } from './engine/limits'
import { formsByViews } from './engine/forms'
import { formCheck, paintCheck, rigCheck } from './engine/rigCheck'
import { publishFaults } from './modelContent'

// The model's checks in plain words: what stops Publish, which limits it is at or past, the size of a character's copy of it, and what looks wrong in the rig.
export function CheckPanel({ content }: { content: ModelContent }) {
  const faults = publishFaults(content)
  // a limit that is also a publish fault is said once, in the faults
  const notes = limitNotes(content).filter(n => !faults.some(f => ['KB', 'levels deep'].some(key => f.includes(key) && n.text.includes(key))))
  const rig = rigCheck(content)
  const formNotes = [...formCheck(content), ...paintCheck(content)]
  const grid = formsByViews(content)
  const kb = Math.round(copyBytes(content) / 102.4) / 10
  return (
    <section className="cmCheck" aria-label="Checks">
      <h2 className="cmInsSub">Checks</h2>
      <p className="cmInsText">A character's copy of this model: {kb} KB (warning above {LIMITS.copyWarnBytes / 1024}, stop at {LIMITS.copyMaxBytes / 1024}).</p>
      {faults.length === 0 && notes.length === 0 && rig.length === 0 && formNotes.length === 0 && <p className="cmInsText" role="status">Nothing to fix: the model can be published.</p>}
      {faults.length > 0 && (
        <>
          <p className="cmInsText"><b>Publish is refused until this is fixed:</b></p>
          <ul className="cmFaults">{faults.map(f => <li key={f} className="cmFaults--stop">{f}</li>)}</ul>
        </>
      )}
      {notes.length > 0 && (
        <ul className="cmFaults">{notes.map(n => <li key={n.text} className={`cmFaults--${n.level}`}><b>{n.level === 'stop' ? 'Stop' : 'Warning'}:</b> {n.text}</li>)}</ul>
      )}
      {rig.length > 0 && (
        <>
          <p className="cmInsText"><b>Rig check:</b></p>
          <ul className="cmFaults">{rig.map(l => <li key={l.text} className="cmFaults--warn">{l.text}</li>)}</ul>
        </>
      )}
      {formNotes.length > 0 && (
        <ul className="cmFaults" aria-label="About forms and paint">{formNotes.map(l => <li key={l.text} className="cmFaults--info"><b>Note:</b> {l.text}</li>)}</ul>
      )}
      {grid.length > 0 && (
        <div className="cmGridWrap">
          <table className="cmGrid" aria-label="Forms by views">
            <caption className="cmInsText">Forms by views: what each form does from the front, and what becomes of it from behind.</caption>
            <thead><tr><th scope="col">Object</th><th scope="col">Axis</th><th scope="col">Form</th><th scope="col">Front</th><th scope="col">Back</th></tr></thead>
            <tbody>
              {grid.map(r => <tr key={`${r.object}/${r.axis}/${r.form}`}><td>{r.object}</td><td>{r.axis}</td><td>{r.form}{r.isDefault ? ' (default)' : ''}</td><td>{r.front}</td><td>{r.back}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
