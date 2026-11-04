import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { TrainingCourse, TrainingCurriculum, TrainingLesson, TrainingProject } from '../../../../api/types'
import DragGap from '../../../../components/DragGap'
import { CheckIcon, CloseIcon, EyeIcon, GripIcon, PencilIcon, PlusIcon, TrashIcon, UndoIcon } from '../../../icons'
import HueSlider from '../../writer/HueSlider'
import { useReorder } from '../plot/useReorder'
import {
  CHILD_KINDS, FIELD_MAX, KIND_LABEL, canAdd, exercisesOfCourse, find, inheritedHue, isBlank, labelOf, parentChoices, type Draft, type Kind,
} from './instructorModel'
import { KIND_ICON } from './InstructorTree'
import type { Instructor } from './useInstructor'

type Item = { id: string; title: string; description: string }

// An ordered list of things a curriculum or a project names (its courses, its exercises), each with a button to take it out of the list.
function RefList({ ownerId, ids, label, ins, nameOf, removeLabel, onRemove }: {
  ownerId: string
  ids: string[]
  label: string
  ins: Instructor
  nameOf: (id: string) => string
  removeLabel: (name: string) => string
  onRemove: (id: string) => void
}) {
  const drag = useReorder<string>((id, before) => ins.reorderRefs(ownerId, id, before), (id, dir) => ins.nudgeRef(ownerId, id, dir))
  if (ids.length === 0) return null
  return (
    <ul className="instRefs" aria-label={label} ref={drag.listRef}>
      <DragGap rect={drag.gap} />
      {ids.map(id => (
        <li key={id} className={`instRef${drag.dragId === id ? ' instItem--dragging' : ''}`} {...drag.item(id)}>
          <span className="instGrip" role="button" tabIndex={0} aria-label={`Move ${nameOf(id)} (Alt+Up or Down)`} title={`Move ${nameOf(id)} (Alt+Up or Down)`} {...drag.grip(id)}><GripIcon size={12} /></span>
          <span className="instRefName">{nameOf(id)}</span>
          <button type="button" className="instIconBtn" aria-label={removeLabel(nameOf(id))} title={removeLabel(nameOf(id))} onClick={() => onRemove(id)}><CloseIcon size={14} /></button>
        </li>
      ))}
    </ul>
  )
}

// A curriculum's or a course's colour. A course with no colour of its own follows its first curriculum's (the Inherit square); with none to follow, or a
// curriculum, the colour is chosen, or taken away.
function HueField({ label, hue, parentHue, onChange }: { label: string; hue: number | null; parentHue: number | null; onChange: (hue: number | null) => void }) {
  if (parentHue !== null) {
    return (
      <HueSlider
        label={label} hue={hue ?? parentHue} centre={parentHue} range={180} inherit={hue === null}
        onChange={h => onChange(h)} onInherit={on => onChange(on ? null : parentHue)}
      />
    )
  }
  if (hue === null) {
    return (
      <p className="instHueNone">
        <span>No colour of its own: it takes the theme&apos;s.</span>
        <button type="button" className="instIconBtn" aria-label={`Choose ${label.toLowerCase()}`} title={`Choose ${label.toLowerCase()}`} onClick={() => onChange(200)}><PlusIcon size={14} /></button>
      </p>
    )
  }
  return (
    <div className="instHueSet">
      <HueSlider label={label} hue={hue} centre={null} range={360} onChange={h => onChange(h)} />
      <button type="button" className="instIconBtn" aria-label={`Remove ${label.toLowerCase()}`} title={`Remove ${label.toLowerCase()}`} onClick={() => onChange(null)}><UndoIcon size={14} /></button>
    </div>
  )
}

// A lesson's material: Markdown, written in a field or read as it will look.
function Material({ lesson, ins }: { lesson: TrainingLesson; ins: Instructor }) {
  const [view, setView] = useState<'write' | 'read'>('write')
  return (
    <div className="instField">
      <div className="instFieldHead">
        <span className="instLabel">Material (Markdown)</span>
        <span className="instTools" role="group" aria-label="Material view">
          <button type="button" className="instIconBtn" aria-label="Write the material" title="Write" aria-pressed={view === 'write'} onClick={() => setView('write')}><PencilIcon size={14} /></button>
          <button type="button" className="instIconBtn" aria-label="Read the material as it will look" title="Rendered" aria-pressed={view === 'read'} onClick={() => setView('read')}><EyeIcon size={14} /></button>
        </span>
      </div>
      {view === 'write'
        ? <textarea className="instText instText--body" aria-label="Material (Markdown)" rows={14} maxLength={FIELD_MAX.body} value={lesson.body} onChange={e => ins.edit(lesson.id, { body: e.target.value })} />
        : <div className="instMarkdown" aria-label="Material, rendered">{lesson.body.trim() ? <ReactMarkdown>{lesson.body}</ReactMarkdown> : <p className="instNote">No material yet.</p>}</div>}
    </div>
  )
}

function ProjectExercises({ project, course, ins }: { project: TrainingProject; course: TrainingCourse; ins: Instructor }) {
  const all = exercisesOfCourse(course)
  const name = (id: string) => labelOf('exercise', all.find(e => e.id === id)?.title ?? '')
  const rest = all.filter(e => !project.exerciseIds.includes(e.id))
  return (
    <div className="instField">
      <span className="instLabel">Exercises it is made of, in order</span>
      <RefList
        ownerId={project.id} ids={project.exerciseIds} label={`Exercises of ${labelOf('project', project.title)}`} ins={ins} nameOf={name}
        removeLabel={n => `Take ${n} out of the project`} onRemove={id => ins.setProjectExercises(project.id, project.exerciseIds.filter(x => x !== id))}
      />
      {project.exerciseIds.length === 0 && <p className="instNote">No exercises yet.</p>}
      <select className="instSelect" aria-label="Add an exercise" value="" disabled={rest.length === 0} onChange={e => { if (e.target.value) ins.setProjectExercises(project.id, [...project.exerciseIds, e.target.value]) }}>
        <option value="">{rest.length === 0 ? (all.length === 0 ? 'The course has no exercises' : 'Every exercise is in') : 'Add an exercise…'}</option>
        {rest.map(e => <option key={e.id} value={e.id}>{`${labelOf('exercise', e.title)} · ${labelOf('lesson', e.lessonTitle)} · ${labelOf('module', e.moduleTitle)}`}</option>)}
      </select>
    </div>
  )
}

function CurriculumCourses({ curriculum, draft, ins }: { curriculum: TrainingCurriculum; draft: Draft; ins: Instructor }) {
  const name = (id: string) => labelOf('course', draft.courses.find(c => c.id === id)?.title ?? '')
  const rest = draft.courses.filter(c => !curriculum.courseIds.includes(c.id))
  return (
    <div className="instField">
      <span className="instLabel">Courses it collects, in order</span>
      <RefList
        ownerId={curriculum.id} ids={curriculum.courseIds} label={`Courses of ${labelOf('curriculum', curriculum.title)}`} ins={ins} nameOf={name}
        removeLabel={n => `Take ${n} out of this curriculum`} onRemove={id => ins.setMembership(id, curriculum.id, false)}
      />
      {curriculum.courseIds.length === 0 && <p className="instNote">No courses yet.</p>}
      <select className="instSelect" aria-label="Add a course to this curriculum" value="" disabled={rest.length === 0} onChange={e => { if (e.target.value) ins.setMembership(e.target.value, curriculum.id, true) }}>
        <option value="">{rest.length === 0 ? 'Every course is in' : 'Add a course…'}</option>
        {rest.map(c => <option key={c.id} value={c.id}>{labelOf('course', c.title)}</option>)}
      </select>
    </div>
  )
}

function Membership({ course, draft, ins }: { course: TrainingCourse; draft: Draft; ins: Instructor }) {
  if (draft.curricula.length === 0) return null
  return (
    <fieldset className="instField instChecks">
      <legend className="instLabel">In these curricula</legend>
      {draft.curricula.map(c => (
        <label key={c.id} className="instCheck">
          <input type="checkbox" checked={c.courseIds.includes(course.id)} onChange={e => ins.setMembership(course.id, c.id, e.target.checked)} />
          <span>{labelOf('curriculum', c.title)}</span>
        </label>
      ))}
    </fieldset>
  )
}

// What changes when something is moved or deleted that others name.
const HINT: Partial<Record<Kind, string>> = {
  module: 'A project of its course stops naming the exercises that were in it.',
  lesson: 'A project of its course stops naming the exercises that were in it.',
  exercise: 'A project of its course stops naming it.',
  course: 'It is taken out of every curriculum that collects it.',
}

// The open item: its fields, what it holds, what can be added inside it, where it can go and Delete.
export function InstructorEditor({ draft, ins, id, focusTitle, onAdded, onRemoved }: {
  draft: Draft
  ins: Instructor
  id: string
  // Put the cursor in the title (the item was just made).
  focusTitle: boolean
  onAdded: (id: string) => void
  onRemoved: (parentId: string | null) => void
}) {
  const found = find(draft, id)
  const [confirming, setConfirming] = useState(false)
  const title = useRef<HTMLInputElement>(null)
  useEffect(() => { setConfirming(false) }, [id])
  useEffect(() => { if (focusTitle) { title.current?.focus(); title.current?.select() } }, [id, focusTitle])
  if (!found) return null

  const kind = found.kind
  const item = found.item as Item
  const Icon = KIND_ICON[kind]
  const label = labelOf(kind, item.title)
  const kids = CHILD_KINDS[kind] ?? []
  const parent = found.parentId
  const choices = parentChoices(draft, id)
  const course = draft.courses.find(c => c.id === (kind === 'project' ? parent : id))
  const typed = found.item as unknown as Record<string, unknown>

  function add(child: Kind) {
    const made = ins.add(child, id)
    if (made) onAdded(made)
  }
  function remove() {
    ins.remove(id)
    onRemoved(parent ?? null)
  }

  return (
    <section className="instEditor" aria-label={`${KIND_LABEL[kind]} editor`}>
      <header className="instEdHead">
        <span className="instKind"><Icon size={16} /> {KIND_LABEL[kind]}</span>
        <span className="instTools">
          {kids.map(k => {
            const why = canAdd(draft, k, id)
            const KidIcon = KIND_ICON[k]
            const noun = KIND_LABEL[k].toLowerCase()
            const text = `Add ${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`
            return <button key={k} type="button" className="instIconBtn" aria-label={text} title={why ?? text} disabled={!!why} onClick={() => add(k)}><KidIcon size={18} /><PlusIcon size={10} /></button>
          })}
          {confirming
            ? (
              <span className="instConfirm" role="group" aria-label={`Delete ${label}?`}>
                <span>Delete {label}{kind === 'curriculum' ? ' (its courses stay)' : ' and what is in it'}?</span>
                <button type="button" className="instIconBtn" aria-label="Confirm delete" title="Confirm delete" onClick={remove}><CheckIcon size={16} /></button>
                <button type="button" className="instIconBtn" aria-label="Cancel delete" title="Cancel" onClick={() => setConfirming(false)}><CloseIcon size={16} /></button>
              </span>
            )
            : <button type="button" className="instIconBtn" aria-label={`Delete ${label}`} title={`Delete ${label}`} onClick={() => (isBlank(draft, id) ? remove() : setConfirming(true))}><TrashIcon size={18} /></button>}
        </span>
      </header>

      <label className="instField">
        <span className="instLabel">Title</span>
        <input ref={title} className="instInput" aria-label="Title" maxLength={FIELD_MAX.title} value={item.title} aria-invalid={item.title.trim() === ''} onChange={e => ins.edit(id, { title: e.target.value })} />
        {ins.faultOf(id) && <span className="instFault" role="note">{ins.faultOf(id)}</span>}
      </label>
      <label className="instField">
        <span className="instLabel">Description</span>
        <textarea className="instText" aria-label="Description" rows={3} maxLength={FIELD_MAX.description} value={item.description} onChange={e => ins.edit(id, { description: e.target.value })} />
      </label>

      {kind === 'curriculum' && (
        <>
          <div className="instField"><span className="instLabel">Colour</span><HueField label="Curriculum colour" hue={typed.hue as number | null} parentHue={null} onChange={h => ins.edit(id, { hue: h }, true)} /></div>
          <CurriculumCourses curriculum={found.item as unknown as TrainingCurriculum} draft={draft} ins={ins} />
        </>
      )}
      {kind === 'course' && (
        <>
          <div className="instField"><span className="instLabel">Colour</span><HueField label="Course colour" hue={typed.hue as number | null} parentHue={inheritedHue(draft, id)} onChange={h => ins.edit(id, { hue: h }, true)} /></div>
          <Membership course={found.item as unknown as TrainingCourse} draft={draft} ins={ins} />
        </>
      )}
      {kind === 'lesson' && <Material lesson={found.item as unknown as TrainingLesson} ins={ins} />}
      {(kind === 'quiz' || kind === 'test' || kind === 'exam') && (
        <label className="instField instField--short">
          <span className="instLabel">Pass mark (%)</span>
          <input
            className="instInput" type="number" min={0} max={100} step={1} aria-label="Pass mark (%)" value={typed.passMark as number}
            onChange={e => { const n = Math.round(Number(e.target.value)); if (!Number.isNaN(n)) ins.edit(id, { passMark: Math.max(0, Math.min(100, n)) }) }}
          />
        </label>
      )}
      {kind === 'project' && course && <ProjectExercises project={found.item as unknown as TrainingProject} course={course} ins={ins} />}

      {choices.length > 0 && (
        <div className="instField">
          <span className="instLabel">Move to</span>
          <select className="instSelect" aria-label="Move to" value="" onChange={e => { if (e.target.value) ins.moveTo(id, e.target.value) }}>
            <option value="">Move to…</option>
            {choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      )}
      {HINT[kind] && <p className="instHint">{HINT[kind]}</p>}
    </section>
  )
}
