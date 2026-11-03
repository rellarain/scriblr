import { useRef, type ReactNode } from 'react'
import { sideVars, useSidebar } from '../writer/sidebarState'
import BookScope from '../writer/BookScope'
import LevelPanel from '../writer/levels/LevelPanel'
import SideResizer from '../writer/levels/SideResizer'
import { TrainingPage, TrainingEmpty } from './TrainingPage'
import { TRAINING_PAGES } from './trainingPages'
import { levelsOf, sizesFor, type TrainingLevel, type TrainingPath } from './trainingPath'
import { COURSES, courseById, lessonOf, moduleOf } from './trainingSeed'
import { courseTabs, deskTabs, lessonTabs, moduleTabs, useTrainingTabs } from './trainingTabs'
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
// brings the focus back to it (closing what is below).
function TrainingLevels({ startAt }: { startAt?: TrainingPath }) {
  const t = useTrainingState(startAt)
  const { path } = t
  const shown = levelsOf(path)
  const sizes = sizesFor(path, t.overrides)
  const focus = shown[shown.length - 1]
  const course = courseById(path.courseId)
  const mod = moduleOf(course, path.moduleId)
  const lesson = lessonOf(mod, path.lessonId)

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
  const enrolledCount = COURSES.filter(c => t.isEnrolled(c.id)).length

  function panel(level: TrainingLevel): ReactNode {
    const size = sizeOf(level)
    const hue = course?.hue
    switch (level) {
      case 'desk':
        return (
          <LevelPanel key={level} level={level} size={size} title="Training Desk" headerExtras={desk.headerExtras} onPromote={t.showDesk} onSetSize={t.setSize(level)}
            minBody={<MinBody level="desk" line={`${plural(enrolledCount, 'course')} enrolled of ${COURSES.length}.`} />}>
            {desk.body}
          </LevelPanel>
        )
      case 'course':
        return (
          <LevelPanel key={level} level={level} size={size} title={course?.title ?? 'Course'} hue={hue} headerExtras={courseTab.headerExtras} onPromote={() => t.promote(level)} onSetSize={t.setSize(level)}
            minBody={<MinBody level="course" line={`${plural(course?.modules.length ?? 0, 'module')} and ${plural(course?.projects.length ?? 0, 'project')}.`} />}>
            {courseTab.body}
          </LevelPanel>
        )
      case 'module':
        return (
          <LevelPanel key={level} level={level} size={size} title={mod?.title ?? 'Module'} hue={hue} headerExtras={moduleTab.headerExtras} onPromote={() => t.promote(level)} onSetSize={t.setSize(level)}
            minBody={<MinBody level="module" line={`${plural(mod?.lessons.length ?? 0, 'lesson')}.`} />}>
            {moduleTab.body}
          </LevelPanel>
        )
      case 'lesson':
        return (
          <LevelPanel key={level} level={level} size={size} title={lesson?.title ?? 'Lesson'} hue={hue} headerExtras={lessonTab.headerExtras} onPromote={() => t.promote(level)} onSetSize={t.setSize(level)}
            minBody={<MinBody level="lesson" line={`${plural(lesson?.exercises.length ?? 0, 'exercise')}.`} />}>
            {lessonTab.body}
          </LevelPanel>
        )
      case 'practice': {
        const kind = path.work?.kind ?? 'exercise'
        const title = kind === 'project'
          ? course?.projects.find(p => p.id === path.work?.id)?.title
          : lesson?.exercises.find(e => e.id === path.work?.id)?.title
        return (
          <LevelPanel key={level} level={level} size="max" title={title ?? TRAINING_PAGES[kind].label} hue={hue} onPromote={() => t.promote(level)} onSetSize={t.setSize(level)}>
            <TrainingPage page={kind}><TrainingEmpty>Nothing to practise yet.</TrainingEmpty></TrainingPage>
          </LevelPanel>
        )
      }
    }
  }

  // Every level below the Desk is re-tinted with its course's colour (the Desk is the app theme itself).
  const scoped = (level: TrainingLevel, node: ReactNode) => (level === 'desk' ? node : <BookScope key={level} code={course?.hue} flow>{node}</BookScope>)

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
