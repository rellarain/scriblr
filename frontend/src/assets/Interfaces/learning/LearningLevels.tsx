import { useEffect, useRef, type ReactNode } from 'react'
import type { TrainingState } from '../../../api/types'
import { RedoIcon } from '../../icons'
import { sideVars, useSidebar } from '../writer/sidebarState'
import BookScope from '../writer/BookScope'
import LevelPanel from '../writer/levels/LevelPanel'
import SideResizer from '../writer/levels/SideResizer'
import { RowDetail, LearningAbout, LearningEmpty, LearningPage } from './LearningPage'
import { LEARNING_PAGES } from './learningPages'
import { courseHue, courseById, exerciseOf, lessonOf, moduleOf, projectOf } from './learningContent'
import { levelsOf, sizesFor, type LearningLevel, type LearningPath } from './learningPath'
import { courseLine, courseTabs, deskLine, doneAction, deskTabs, lessonTabs, moduleTabs, useLearningTabs } from './learningTabs'
import { loadLearning, useLearning } from './learningStore'
import { useLearningState } from './useLearningState'

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

// What a level shows under its header strip when it is folded to Min: what the level is, and a line on what is in it.
function MinBody({ level, line }: { level: Exclude<LearningLevel, 'practice'>; line: string }) {
  return (
    <div className="wrLevelMinBody">
      <p className="lrMinDefinition">{LEARNING_PAGES[level].definition}</p>
      <p className="lrMinLine">{line}</p>
    </div>
  )
}

// Learning: five stacked levels -- the Desk, the open Course, its Module, the Lesson and, deepest, the Practice (an exercise or a project) --
// laid out like the Writer's (writer/levels/WriterLevels.tsx): the deepest on the path has the focus (Max), the level above it is Mid and
// the rest Min, in a side column beside it. Opening a course, module, lesson or exercise moves the focus down a level, and a level's title
// brings the focus back to it (closing what is below). The courses and the progress come from the backend (learningStore.ts): the levels
// are not drawn until they have loaded.
function LearningLevels({ startAt }: { startAt?: LearningPath }) {
  const data = useLearning()
  useEffect(() => { void loadLearning() }, [])
  if (data.status === 'ready' && data.training) return <ReadyLevels training={data.training} actionError={data.actionError} startAt={startAt} />
  return (
    <div className="wrLevels lrLevels lrLevels--focus-desk">
      <LevelPanel level="desk" size="max" title="Learning Desk" onPromote={() => {}} onSetSize={() => {}}>
        {data.status === 'error'
          ? (
            <div className="lrStatus" role="alert">
              <p className="wrError">{data.error ?? 'Learning could not be loaded.'}</p>
              <button type="button" className="lrRowAction" aria-label="Try loading again" title="Try loading again" onClick={() => { void loadLearning(true) }}><RedoIcon size={18} /></button>
            </div>
          )
          : <p className="wrMuted lrStatus" role="status">Loading courses…</p>}
      </LevelPanel>
    </div>
  )
}

function ReadyLevels({ training, actionError, startAt }: { training: TrainingState; actionError: string | null; startAt?: LearningPath }) {
  const t = useLearningState(training, startAt)
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

  const desk = useLearningTabs('desk', deskTabs(t), sizes.desk ?? 'min')
  const courseTab = useLearningTabs('course', course ? courseTabs(t, course) : null, sizes.course ?? 'min')
  const moduleTab = useLearningTabs('module', mod ? moduleTabs(t, mod) : null, sizes.module ?? 'min')
  const lessonTab = useLearningTabs('lesson', lesson ? lessonTabs(t, lesson) : null, sizes.lesson ?? 'min')

  const sizeOf = (level: LearningLevel) => sizes[level] ?? 'min'

  function panel(level: LearningLevel): ReactNode {
    const size = sizeOf(level)
    switch (level) {
      case 'desk':
        return (
          <LevelPanel key={level} level={level} size={size} title="Learning Desk" headerExtras={desk.headerExtras} onPromote={t.showDesk} onSetSize={t.setSize(level)}
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
          <LevelPanel key={level} level={level} size="max" title={item?.title ?? LEARNING_PAGES[kind].label} hue={hue} onPromote={() => t.promote(level)} onSetSize={t.setSize(level)}>
            <LearningPage page={kind} done={item ? doneAction(t, item.id, item.title) : undefined}>
              {item && <LearningAbout text={item.description} />}
              {project && (exercisesOfProject.length === 0
                ? <LearningEmpty>No exercises in it yet.</LearningEmpty>
                : (
                  <ul className="lrList" aria-label={`Exercises of ${project.title}`}>
                    {exercisesOfProject.map(e => <li key={e.id} className="lrRow lrRow--static"><span className="lrRowText lrRowText--static"><span className="lrRowTitle">{e.title}</span><RowDetail about={e.description} /></span></li>)}
                  </ul>
                ))}
              {exercise && <LearningEmpty>Nothing to practise yet.</LearningEmpty>}
            </LearningPage>
          </LevelPanel>
        )
      }
    }
  }

  // Every level below the Desk is re-tinted with its course's colour (the Desk is the app theme itself).
  const scoped = (level: LearningLevel, node: ReactNode) => (level === 'desk' ? node : <BookScope key={level} code={hue} flow>{node}</BookScope>)

  const above = shown.filter(l => l !== focus)
  const sideVarStyle = side.width !== null && above.length > 0 ? sideVars(side.width) : undefined

  return (
    <div ref={levelsRef} className={`wrLevels lrLevels lrLevels--focus-${focus}`} data-focus={focus} style={sideVarStyle}>
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

export default LearningLevels
