import { useState } from 'react'
import { RedoIcon } from '../../../icons'
import { SaveCluster } from '../../../../components/SaveCluster'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import { find } from './instructorModel'
import { InstructorEditor } from './InstructorEditor'
import { InstructorTree } from './InstructorTree'
import { useInstructor } from './useInstructor'
import './instructor.scss'

// AUI > Instructor: where the Training courses are written. The courses as a tree (each curriculum with its courses, then the courses that are in none,
// and under a course its modules, lessons, exercises, quizzes, tests, projects and exams) and, beside it, the open item to edit. Edits save the way the
// Writer's do: the Save button, and autosave when the user has turned it on. Training shows what is saved.
function InstructorConsole() {
  const ins = useInstructor()
  const { ui } = useSettings()
  const [selected, setSelected] = useState<string | null>(null)
  // The item that was just made: its title takes the cursor.
  const [fresh, setFresh] = useState<string | null>(null)
  const { draft } = ins

  if (ins.status === 'error') {
    return (
      <div className="instNote" role="alert">
        <p>{ins.loadError ?? 'The courses could not be loaded.'}</p>
        <button type="button" className="instIconBtn" aria-label="Try loading again" title="Try loading again" onClick={ins.reload}><RedoIcon size={18} /></button>
      </div>
    )
  }

  if (ins.status === 'loading' || !draft) return <p className="instNote" role="status">Loading the courses…</p>

  const first = draft.curricula[0]?.id ?? draft.courses[0]?.id ?? null
  const current = selected && find(draft, selected) ? selected : first

  function pick(id: string) {
    setSelected(id)
    setFresh(null)
  }
  function added(id: string) {
    setSelected(id)
    setFresh(id)
  }
  // After a delete: the item it was in, or the first of what is left.
  function removed(parentId: string | null) {
    setSelected(parentId)
    setFresh(null)
  }

  return (
    <div className="instPage">
      <div className="instBar">
        <h2 className="instBarTitle">Instructor</h2>
        <SaveCluster
          status={ins.saveStatus} onSave={() => { void ins.saveNow() }} scope=".instPage"
          autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: ins.saveCountdown.nextSaveAt, wait: ins.saveCountdown.wait }}
        />
      </div>
      {ins.saveStatus.error && <p className="instNote instNote--error" role="alert">{ins.saveStatus.error}</p>}
      <div className="instSplit">
        <InstructorTree draft={draft} ins={ins} selectedId={current} onSelect={pick} onAdded={added} />
        {current
          ? <InstructorEditor draft={draft} ins={ins} id={current} focusTitle={fresh === current} onAdded={added} onRemoved={removed} />
          : <p className="instNote">Pick something in the tree to edit it, or add a curriculum or a course.</p>}
      </div>
    </div>
  )
}

export default InstructorConsole
