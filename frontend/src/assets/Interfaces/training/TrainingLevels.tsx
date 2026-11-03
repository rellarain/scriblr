import { useEffect, useRef, type ReactNode } from 'react'
import type { TrainingState as TrainingData } from '../../../api/types'
import { RedoIcon } from '../../icons'
import { sideVars, useSidebar } from '../writer/sidebarState'
import BookScope from '../writer/BookScope'
import LevelPanel from '../writer/levels/LevelPanel'
import SideResizer from '../writer/levels/SideResizer'
import { TrainingEmpty, TrainingPage } from './TrainingPage'
import { TRAINING_PAGES } from './trainingPages'
import { courseHue, courseById, exerciseOf, lessonOf, moduleOf, projectOf } from './trainingContent'
import { levelsOf, sizesFor, type TrainingLevel, type TrainingPath } from './trainingPath'
import { courseLine, courseTabs, deskLine, doneAction, deskTabs, lessonTabs, moduleTabs, useTrainingTabs } from './trainingTabs'
import { loadTraining, useTraining } from './trainingStore'
import { useTrainingState } from './useTrainingState'

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

// What a level shows under its header strip when it is folded to Min: what the level is, and a line on what is in it.
function MinBody({ level, line }: { level: Exclude<TrainingLevel, 'practice'>; line: string }) {
  return (
    <div className="wrLevelMinBody">
      <p className="trMinDefinition">{TRAINING_PAGES[level].definition}</p>
      <p className="trMinLine">{line}</p>
    </div>
  )
}

// Training: five stacked levels -- the Desk, the open Course, its Module, the Lesson and, deepest, the Practice (an exercise or a project) --
// laid out like the Writer's (writer/levels/WriterLevels.tsx): the deepest on the path has the focus (Max), the level above it is Mid and
// the rest Min, in a side column beside it. Opening a course, module, lesson or exercise moves the focus down a level, and a level's title
// brings the focus back to it (closing what is below). The courses and the progress come from the backend (trainingStore.ts): the levels
// are not drawn until they have loaded.
function TrainingLevels({ startAt }: { startAt?: TrainingPath }) {
  const data = useTraining()
  useEffect(() => { void loadTraining() }, [])
  if (data.status === 'ready' && data.training) return <ReadyLevels training={data.training} actionError={data.actionError} startAt={startAt} />
  return (
    <div className="wrLevels trLevels trLevels--focus-desk">
      <LevelPanel level="desk" size="max" title="Training Desk" onPromote={() => {}} onSetSize={() => {}}>
        {data.status === 'error'
          ? (
            <div className="trStatus" role="alert">
              <p className="wrError">{data.error ?? 'Training could not be loaded.'}</p>
              <button type="button" className="trRowAction" aria-label="Try loading again" title="Try loading again" onClick={() => { void loadTraining(true) }}><RedoIcon size={18} /></button>
            </div>
          )
          : <p className="wrMuted trStatus" role="status">Loading training…</p>}
      </LevelPanel>
    </div>
  )
}

function ReadyLevels({ training, actionError, startAt }: { training: TrainingData; actionError: string | null; startAt?: TrainingPath }) {
  const t = useTrainingState(training, startAt)
  const { path, content } = t
  const shown = levelsOf(path)
  const sizes = sizesFor(path, t.overrides)
  const focus = shown[shown.length - 1]
  const course = courseById(content, path.courseId)
  const mod = moduleOf(course, path.moduleId)
  const lesson = lessonOf(mod, path.lessonId)
  const hue = courseHue(content, course)

  // The side column: its width, dragged straight onto the element's CSS variables (no render per mouse move) and stored on release.
  const side = useSidebar()
  const levelsRef = useRef<HTMLDivElement>(null)
  const dragSide = (width: number | null) => {
    const style = levelsRef.current?.style
    if (!style) return
    if (width === null) for (const name of Object.keys(sideVars(0))) style.removeProperty(name)
    else for (const [name, value] of Object.entries(sideVars(width))) style.setProperty(name, value)
  }

  const desk = useTrainingTabs('desk', deskTabs(t), sizes.desk ?? 'min')
  const courseTab = useTrainingTabs('course', course ? courseTabs(t, course) : null, sizes.course ?? 'min')
  const moduleTab = useTrainingTabs('module', mod ? moduleTabs(t, mod) : null, sizes.module ?? 'min')
  const lessonTab = useTrainingTabs('lesson', lesson ? lessonTabs(t, lesson) : null, sizes.lesson ?? 'min')

  const sizeOf = (level: TrainingLevel) => sizes[level] ?? 'min'

  function panel(level: TrainingLevel): ReactNode {
    const size = sizeOf(level)
    switch (level) {
      case 'desk':
        return (
          <LevelPanel key={level} level={level} size={size} title="Training Desk" headerExtras={desk.headerExtras} onPromote={t.showDesk} onSetSize={t.setSize(level)}
            minBody={<MinBody level="desk" line={deskLine(t)} />}>
            {actionError && <p className="wrError" role="alert">{actionError}</p>}
            {desk.body}
          </LevelPanel>
        )
      case 'course':
        return (
          <LevelPanel key={level} level={level} size={size} title={course?.title ?? 'Course'} hue={hue} headerExtras={courseTab.headerExtras} onPromote={() => t.promote(level)} onSetSize={t.setSize(level)}
            minBody={<MinBody level="course" line={course ? courseLine(t, course) : ''} />}>
            {courseTab.body}
          </LevelPanel>
        )
      case 'module':
        return (
          <LevelPanel key={level} level={level} size={size} title={mod?.title ?? 'Module'} hue={hue} headerExtras={moduleTab.headerExtras} onPromote={() => t.promote(level)} onSetSize={t.setSize(level)}
            minBody={<MinBody level="module" line={`${plural(mod?.lessons.length ?? 0, 'lesson')} and ${plural(mod?.tests.length ?? 0, 'test')}.`} />}>
            {moduleTab.body}
          </LevelPanel>
        )
      case 'lesson':
        return (
          <LevelPanel key={level} level={level} size={size} title={lesson?.title ?? 'Lesson'} hue={hue} headerExtras={lessonTab.headerExtras} onPromote={() => t.promote(level)} onSetSize={t.setSize(level)}
            minBody={<MinBody level="lesson" line={`${plural(lesson?.exercises.length ?? 0, 'exercise')} and ${plural(lesson?.quizzes.length ?? 0, 'quiz')}.`} />}>
            {lessonTab.body}
          </LevelPanel>
        )
      case 'practice': {
        const kind = path.work?.kind ?? 'exercise'
        const exercise = kind === 'exercise' ? exerciseOf(lesson, path.work?.id ?? null) : undefined
        const project = kind === 'project' ? projectOf(course, path.work?.id ?? null) : undefined
        const item = exercise ?? project
        const allExercises = course ? course.modules.flatMap(m => m.lessons.flatMap(l => l.exercises)) : []
        const exercisesOfProject = project ? project.exerciseIds.flatMap(id => allExercises.filter(e => e.id === id)) : []
        return (
          <LevelPanel key={level} level={level} size="max" title={item?.title ?? TRAINING_PAGES[kind].label} hue={hue} onPromote={() => t.promote(level)} onSetSize={t.setSize(level)}>
            <TrainingPage page={kind} done={item ? doneAction(t, item.id, item.title) : undefined}>
              {item?.description && <p className="trAbout">{item.description}</p>}
              {project && (exercisesOfProject.length === 0
                ? <TrainingEmpty>No exercises in it yet.</TrainingEmpty>
                : (
                  <ul className="trList" aria-label={`Exercises of ${project.title}`}>
                    {exercisesOfProject.map(e => <li key={e.id} className="trRow trRow--static"><span className="trRowText trRowText--static"><span className="trRowTitle">{e.title}</span>{e.description && <span className="trRowDetail">{e.description}</span>}</span></li>)}
                  </ul>
                ))}
              {exercise && <TrainingEmpty>Nothing to practise yet.</TrainingEmpty>}
            </TrainingPage>
          </LevelPanel>
        )
      }
    }
  }

  // Every level below the Desk is re-tinted with its course's colour (the Desk is the app theme itself).
  const scoped = (level: TrainingLevel, node: ReactNode) => (level === 'desk' ? node : <BookScope key={level} code={hue} flow>{node}</BookScope>)

  const above = shown.filter(l => l !== focus)
  const sideVarStyle = side.width !== null && above.length > 0 ? sideVars(side.width) : undefined

  return (
    <div ref={levelsRef} className={`wrLevels trLevels trLevels--focus-${focus}`} data-focus={focus} style={sideVarStyle}>
      {above.length > 0
        ? (
          <>
            <div className="wrLevelsSide">
              {above.map(l => scoped(l, panel(l)))}
              <SideResizer onDrag={dragSide} onCommit={side.setWidth} onReset={() => { side.setWidth(null); dragSide(null) }} />
            </div>
            {scoped(focus, panel(focus))}
          </>
        )
        : scoped(focus, panel(focus))}
    </div>
  )
}

export default TrainingLevels
