import { useEffect, useMemo, useRef, useState } from 'react'
import { saveTrainingContent } from '../../../../api/trainingApi'
import { combineCountdown, combineSaveStatus, useAutosave } from '../../../../lib/useAutosave'
import { adoptTraining, loadTraining, useTraining } from '../../training/trainingStore'
import * as model from './instructorModel'
import type { Draft, Fault, Fields, Kind, MakeRandom } from './instructorModel'

// The Instructor console's state: the Training courses as a draft of its own (copied from the store once it has loaded: the server trims what it saves,
// and what Training does meanwhile -- an enrolment -- replaces the store's courses, neither of which must reach what is being typed), edits that
// save the way the Writer's do (lib/useAutosave.ts: the Save button, and autosave when the user has turned it on), and the operations of
// instructorModel.ts. A save the server would refuse (a blank title) is not sent: it fails with the reason, which rings the Save button. What the
// server answers with is handed to the Training store, so a Training page that is open shows the new courses at once.
export function useInstructor(random: MakeRandom = Math.random) {
  const data = useTraining()
  const [draft, setDraft] = useState<Draft | null>(null)
  const ref = useRef<Draft | null>(null)

  useEffect(() => { void loadTraining() }, [])
  useEffect(() => {
    if (ref.current === null && data.status === 'ready' && data.training) {
      ref.current = model.draftOf(data.training.content)
      setDraft(ref.current)
    }
  }, [data.status, data.training])

  const faults: Fault[] = useMemo(() => (draft ? model.faults(draft) : []), [draft])

  const autosave = useAutosave<Draft>({
    save: async value => {
      const problems = model.faults(value)
      if (problems.length > 0) throw new Error(`Cannot save yet: ${problems[0].message}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}`)
      adoptTraining(await saveTrainingContent(value))
    },
  })

  // Take a changed draft: a text edit waits like typing, a structural one is kept waiting too and goes with the next save.
  function commit(next: Draft, immediate: boolean) {
    if (next === ref.current) return
    ref.current = next
    setDraft(next)
    if (immediate) void autosave.saveNow(next)
    else autosave.schedule(next)
  }
  const current = () => ref.current as Draft

  return {
    status: data.status === 'idle' ? 'loading' as const : data.status === 'ready' && draft === null ? 'loading' as const : data.status,
    loadError: data.error,
    reload: () => { void loadTraining(true) },
    draft,
    faults,
    faultOf: (id: string) => faults.find(f => f.id === id)?.message,

    // A new item inside `parentId`; the new id (null when a cap stops it).
    add(kind: Kind, parentId: string | null): string | null {
      const r = model.add(current(), kind, parentId, random)
      if (r.id) commit(r.draft, true)
      return r.id
    },
    // A change of one thing's fields. Typing (a title, a description, the material, a pass mark) waits; a choice (a colour) is a structural edit.
    edit(id: string, fields: Partial<Fields>, immediate = false) { commit(model.patch(current(), id, fields), immediate) },
    remove(id: string) { commit(model.remove(current(), id), true) },
    move(id: string, beforeId: string | null) { commit(model.moveItem(current(), id, beforeId), true) },
    nudge(id: string, dir: -1 | 1) { commit(model.nudgeItem(current(), id, dir), true) },
    moveTo(id: string, parentId: string) { commit(model.moveTo(current(), id, parentId), true) },
    setMembership(courseId: string, curriculumId: string, on: boolean) { commit(model.setMembership(current(), courseId, curriculumId, on), true) },
    reorderRefs(ownerId: string, refId: string, beforeId: string | null) { commit(model.reorderRefs(current(), ownerId, refId, beforeId), true) },
    nudgeRef(ownerId: string, refId: string, dir: -1 | 1) { commit(model.nudgeRef(current(), ownerId, refId, dir), true) },
    setProjectExercises(projectId: string, ids: string[]) { commit(model.setProjectExercises(current(), projectId, ids), true) },

    saveStatus: combineSaveStatus(autosave),
    saveCountdown: combineCountdown(autosave),
    saveNow: autosave.flush,
  }
}

export type Instructor = ReturnType<typeof useInstructor>
