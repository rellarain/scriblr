import { useState, type ComponentType, type ReactNode } from 'react'
import type { TrainingCourse, TrainingCurriculum, TrainingLesson, TrainingModule } from '../../../../api/types'
import DragGap from '../../../../components/DragGap'
import {
  BookFaceIcon, BriefcaseIcon, CatalogIcon, CheckboxIcon, ChevronDownIcon, ChevronRightIcon, GripIcon, NoteIcon, PlusIcon, QuestionIcon, RevisionIcon, StackIcon, TicketIcon,
  type IconProps,
} from '../../../icons'
import { looseCourses } from '../../training/trainingContent'
import { useReorder } from '../plot/useReorder'
import { KIND_LABEL, canAdd, labelOf, type Draft, type Kind } from './instructorModel'
import type { Instructor } from './useInstructor'

export const KIND_ICON: Record<Kind, ComponentType<IconProps>> = {
  curriculum: CatalogIcon, course: BookFaceIcon, module: StackIcon, lesson: NoteIcon, exercise: RevisionIcon, project: BriefcaseIcon, quiz: QuestionIcon, test: CheckboxIcon, exam: TicketIcon,
}

// One list of the tree, in its order: a grip on each item drags it (or Alt+Up and Alt+Down move it one place), within this list only (a hook of its own:
// an item dropped on another list is ignored). The items are the direct children of the list; each holds its row and whatever is under it.
function Reorderable({ ids, onMove, onNudge, label, children }: {
  ids: string[]
  onMove: (id: string, beforeId: string | null) => void
  onNudge: (id: string, dir: -1 | 1) => void
  label: string
  children: (id: string, grip: ReturnType<ReturnType<typeof useReorder<string>>['grip']>) => ReactNode
}) {
  const drag = useReorder<string>(onMove, onNudge)
  return (
    <ul className="instList" role="group" aria-label={label} ref={drag.listRef}>
      <DragGap rect={drag.gap} />
      {ids.map(id => <li key={id} role="none" className={`instItem${drag.dragId === id ? ' instItem--dragging' : ''}`} {...drag.item(id)}>{children(id, drag.grip(id))}</li>)}
    </ul>
  )
}

interface NodeProps {
  ins: Instructor
  selectedId: string | null
  onSelect: (id: string) => void
  folded: Set<string>
  onFold: (id: string) => void
}

// One row: the grip, the fold caret (when something is under it), the icon and title (the button that selects it) and what is wrong with it.
function Row({ id, kind, title, grip, hasKids, ctx }: {
  id: string
  kind: Kind
  title: string
  grip: ReturnType<ReturnType<typeof useReorder<string>>['grip']>
  hasKids: boolean
  ctx: NodeProps
}) {
  const label = labelOf(kind, title)
  const Icon = KIND_ICON[kind]
  const on = ctx.selectedId === id
  const fault = ctx.ins.faultOf(id)
  const open = !ctx.folded.has(id)
  return (
    <div className={`instRow${on ? ' instRow--on' : ''}${fault ? ' instRow--invalid' : ''}`} role="treeitem" aria-selected={on} aria-expanded={hasKids ? open : undefined}>
      <span className="instGrip" role="button" tabIndex={0} aria-label={`Move ${label} (Alt+Up or Down)`} title={`Move ${label} (Alt+Up or Down)`} {...grip}><GripIcon size={12} /></span>
      {hasKids
        ? <button type="button" className="instCaret" aria-label={`${open ? 'Fold' : 'Unfold'} ${label}`} title={`${open ? 'Fold' : 'Unfold'} ${label}`} onClick={() => ctx.onFold(id)}>{open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}</button>
        : <span className="instCaret instCaret--none" aria-hidden="true" />}
      <button type="button" className="instRowMain" aria-current={on} onClick={() => ctx.onSelect(id)} title={`${KIND_LABEL[kind]}: ${label}`}>
        <Icon size={16} />
        <span className="instRowTitle">{label}</span>
      </button>
      {fault && <span className="instFault" role="note">{fault}</span>}
    </div>
  )
}

function LessonNode({ lesson, grip, ctx }: { lesson: TrainingLesson; grip: Parameters<typeof Row>[0]['grip']; ctx: NodeProps }) {
  const { ins } = ctx
  const kids = lesson.exercises.length + lesson.quizzes.length > 0
  return (
    <>
      <Row id={lesson.id} kind="lesson" title={lesson.title} grip={grip} hasKids={kids} ctx={ctx} />
      {kids && !ctx.folded.has(lesson.id) && (
        <>
          {lesson.exercises.length > 0 && (
            <Reorderable ids={lesson.exercises.map(e => e.id)} onMove={ins.move} onNudge={ins.nudge} label={`Exercises of ${labelOf('lesson', lesson.title)}`}>
              {(id, g) => <Row id={id} kind="exercise" title={lesson.exercises.find(e => e.id === id)!.title} grip={g} hasKids={false} ctx={ctx} />}
            </Reorderable>
          )}
          {lesson.quizzes.length > 0 && (
            <Reorderable ids={lesson.quizzes.map(q => q.id)} onMove={ins.move} onNudge={ins.nudge} label={`Quizzes of ${labelOf('lesson', lesson.title)}`}>
              {(id, g) => <Row id={id} kind="quiz" title={lesson.quizzes.find(q => q.id === id)!.title} grip={g} hasKids={false} ctx={ctx} />}
            </Reorderable>
          )}
        </>
      )}
    </>
  )
}

function ModuleNode({ mod, grip, ctx }: { mod: TrainingModule; grip: Parameters<typeof Row>[0]['grip']; ctx: NodeProps }) {
  const { ins } = ctx
  const kids = mod.lessons.length + mod.tests.length > 0
  return (
    <>
      <Row id={mod.id} kind="module" title={mod.title} grip={grip} hasKids={kids} ctx={ctx} />
      {kids && !ctx.folded.has(mod.id) && (
        <>
          {mod.lessons.length > 0 && (
            <Reorderable ids={mod.lessons.map(l => l.id)} onMove={ins.move} onNudge={ins.nudge} label={`Lessons of ${labelOf('module', mod.title)}`}>
              {(id, g) => <LessonNode lesson={mod.lessons.find(l => l.id === id)!} grip={g} ctx={ctx} />}
            </Reorderable>
          )}
          {mod.tests.length > 0 && (
            <Reorderable ids={mod.tests.map(t => t.id)} onMove={ins.move} onNudge={ins.nudge} label={`Tests of ${labelOf('module', mod.title)}`}>
              {(id, g) => <Row id={id} kind="test" title={mod.tests.find(t => t.id === id)!.title} grip={g} hasKids={false} ctx={ctx} />}
            </Reorderable>
          )}
        </>
      )}
    </>
  )
}

function CourseNode({ course, grip, ctx }: { course: TrainingCourse; grip: Parameters<typeof Row>[0]['grip']; ctx: NodeProps }) {
  const { ins } = ctx
  const kids = course.modules.length + course.projects.length + course.exams.length > 0
  return (
    <>
      <Row id={course.id} kind="course" title={course.title} grip={grip} hasKids={kids} ctx={ctx} />
      {kids && !ctx.folded.has(course.id) && (
        <>
          {course.modules.length > 0 && (
            <Reorderable ids={course.modules.map(m => m.id)} onMove={ins.move} onNudge={ins.nudge} label={`Modules of ${labelOf('course', course.title)}`}>
              {(id, g) => <ModuleNode mod={course.modules.find(m => m.id === id)!} grip={g} ctx={ctx} />}
            </Reorderable>
          )}
          {course.projects.length > 0 && (
            <Reorderable ids={course.projects.map(p => p.id)} onMove={ins.move} onNudge={ins.nudge} label={`Projects of ${labelOf('course', course.title)}`}>
              {(id, g) => <Row id={id} kind="project" title={course.projects.find(p => p.id === id)!.title} grip={g} hasKids={false} ctx={ctx} />}
            </Reorderable>
          )}
          {course.exams.length > 0 && (
            <Reorderable ids={course.exams.map(x => x.id)} onMove={ins.move} onNudge={ins.nudge} label={`Exams of ${labelOf('course', course.title)}`}>
              {(id, g) => <Row id={id} kind="exam" title={course.exams.find(x => x.id === id)!.title} grip={g} hasKids={false} ctx={ctx} />}
            </Reorderable>
          )}
        </>
      )}
    </>
  )
}

function CurriculumNode({ curriculum, courses, grip, ctx }: { curriculum: TrainingCurriculum; courses: TrainingCourse[]; grip: Parameters<typeof Row>[0]['grip']; ctx: NodeProps }) {
  const { ins } = ctx
  const members = curriculum.courseIds.flatMap(id => courses.filter(c => c.id === id))
  return (
    <>
      <Row id={curriculum.id} kind="curriculum" title={curriculum.title} grip={grip} hasKids={members.length > 0} ctx={ctx} />
      {members.length > 0 && !ctx.folded.has(curriculum.id) && (
        <Reorderable
          ids={members.map(c => c.id)} label={`Courses of ${labelOf('curriculum', curriculum.title)}`}
          onMove={(id, before) => ins.reorderRefs(curriculum.id, id, before)} onNudge={(id, dir) => ins.nudgeRef(curriculum.id, id, dir)}
        >
          {(id, g) => <CourseNode course={members.find(c => c.id === id)!} grip={g} ctx={ctx} />}
        </Reorderable>
      )}
    </>
  )
}

// The courses, as the Catalog groups them: each curriculum with its courses (a course in two is under both), then the courses that are in none. Every
// list can be ordered; the "+" buttons at the top add a curriculum and a course (the course joins the curriculum that is selected).
export function InstructorTree({ draft, ins, selectedId, onSelect, onAdded }: { draft: Draft; ins: Instructor; selectedId: string | null; onSelect: (id: string) => void; onAdded: (id: string) => void }) {
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const ctx: NodeProps = { ins, selectedId, onSelect, folded, onFold: id => setFolded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  const loose = looseCourses({ schemaVersion: 1, ...draft })
  const selectedCurriculum = draft.curricula.find(c => c.id === selectedId)
  const why = (kind: Kind) => canAdd(draft, kind, null)

  function add(kind: 'curriculum' | 'course') {
    const id = ins.add(kind, kind === 'course' ? selectedCurriculum?.id ?? null : null)
    if (id) onAdded(id)
  }

  return (
    <aside className="instTree" aria-label="Courses">
      <div className="instTreeHead">
        <span className="instTreeTitle">Courses</span>
        <span className="instTools">
          <button type="button" className="instIconBtn" aria-label="Add a curriculum" title={why('curriculum') ?? 'Add a curriculum'} disabled={!!why('curriculum')} onClick={() => add('curriculum')}><CatalogIcon size={18} /><PlusIcon size={10} /></button>
          <button type="button" className="instIconBtn" aria-label="Add a course" title={why('course') ?? (selectedCurriculum ? 'Add a course to the selected curriculum' : 'Add a course')} disabled={!!why('course')} onClick={() => add('course')}><BookFaceIcon size={18} /><PlusIcon size={10} /></button>
        </span>
      </div>
      {draft.curricula.length + draft.courses.length === 0 && <p className="instNote">Nothing yet. Add a curriculum, or a course.</p>}
      <div className="instTreeBody" role="tree" aria-label="Curricula and courses">
        {draft.curricula.length > 0 && (
          <Reorderable ids={draft.curricula.map(c => c.id)} onMove={ins.move} onNudge={ins.nudge} label="Curricula">
            {(id, g) => <CurriculumNode curriculum={draft.curricula.find(c => c.id === id)!} courses={draft.courses} grip={g} ctx={ctx} />}
          </Reorderable>
        )}
        {loose.length > 0 && (
          <>
            <h3 className="instGroupTitle">Other courses</h3>
            <Reorderable ids={loose.map(c => c.id)} onMove={ins.move} onNudge={ins.nudge} label="Other courses">
              {(id, g) => <CourseNode course={loose.find(c => c.id === id)!} grip={g} ctx={ctx} />}
            </Reorderable>
          </>
        )}
      </div>
    </aside>
  )
}
