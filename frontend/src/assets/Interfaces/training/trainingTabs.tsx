import {
  BookFaceIcon, BookOpenIcon, BriefcaseIcon, CatalogIcon, CheckIcon, CheckboxIcon, GearIcon, HelpIcon, NoteIcon, OutlineIcon, PageIcon, PlusIcon, QuestionIcon, RevisionIcon, StackIcon, TicketIcon,
} from '../../icons'
import type { TrainingCourse, TrainingLesson, TrainingModule } from '../../../api/types'
import ThemeSettingsPanel from '../../../theme/ThemeSettingsPanel'
import HelpArticles from '../writer/levels/HelpArticles'
import { useTabbedLevel, type LevelTab } from '../writer/levels/LevelTabs'
import { TrainingAssessments, TrainingEmpty, TrainingList, TrainingMarkdown, TrainingPage, type DoneAction, type TrainingRow } from './TrainingPage'
import { courseProgress, looseCourses, progressText } from './trainingContent'
import { TRAINING_PAGES } from './trainingPages'
import type { TrainingLevel } from './trainingPath'
import type { TrainingState } from './useTrainingState'

// Each level's tabs: at Mid one tab at a time, at Max a tile for each (writer/levels/LevelTabs.tsx, the same tabbed level as the Writer's).
// The page behind a tab says what it is and lists what is on it; what there is to open (a module, a lesson) opens the next level, and a thing
// that can be marked complete has a button for it.

const DESK_HELP = 'The Training desk shows the courses you are enrolled in; the catalog lists every course, grouped in its curricula. Open a course to see its modules, exams and projects, then a module for its lessons and tests, and a lesson for its material, quizzes and exercises.'
export const TRAINING_HELP_NAMES = ['training', 'desk']

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

// The button that marks something complete, and says so (pressed) when it is.
const doneAction = (t: TrainingState, id: string, title: string): DoneAction => {
  const done = t.isDone(id)
  return { label: done ? `Mark ${title} not complete` : `Mark ${title} complete`, done, onClick: () => t.toggleDone(id) }
}

const courseRow = (t: TrainingState, c: TrainingCourse, withProgress: boolean): TrainingRow => {
  const enrolled = t.isEnrolled(c.id)
  return {
    id: c.id, title: c.title,
    detail: [c.description, withProgress && enrolled ? progressText(c, t.progress) : ''].filter(Boolean).join(' · '),
    onOpen: () => t.openCourse(c.id),
    actions: [enrolled
      ? { label: `Leave ${c.title}`, Icon: CheckIcon, pressed: true, onClick: () => t.toggleEnrolled(c.id) }
      : { label: `Enrol in ${c.title}`, Icon: PlusIcon, pressed: false, onClick: () => t.toggleEnrolled(c.id) }],
  }
}

export function deskTabs(t: TrainingState): LevelTab[] {
  const { content } = t
  const enrolled = content.courses.filter(c => t.isEnrolled(c.id))
  const loose = looseCourses(content)
  return [
    {
      id: 'courses', label: 'Courses', Icon: BookOpenIcon,
      render: () => (
        <TrainingPage page="desk">
          {enrolled.length === 0
            ? <TrainingEmpty>You are not enrolled in any course yet. Pick one from the Catalog.</TrainingEmpty>
            : <TrainingList label="Enrolled courses" openLabel={title => `Open ${title}`} Icon={BookFaceIcon} rows={enrolled.map(c => courseRow(t, c, true))} />}
        </TrainingPage>
      ),
    },
    {
      id: 'catalog', label: 'Catalog', Icon: CatalogIcon,
      render: () => (
        <TrainingPage page="catalog">
          {content.courses.length === 0 && <TrainingEmpty>There are no courses yet.</TrainingEmpty>}
          {content.curricula.map(cur => (
            <section key={cur.id} className="trGroup" aria-label={cur.title}>
              <h4 className="trGroupTitle">{cur.title}</h4>
              <p className="trGroupDefinition" title={TRAINING_PAGES.curriculum.definition}>{cur.description}</p>
              {cur.courseIds.length === 0
                ? <TrainingEmpty>No courses in it yet.</TrainingEmpty>
                : <TrainingList
                  label={`Courses of ${cur.title}`} openLabel={title => `Open ${title}`} Icon={BookFaceIcon}
                  rows={cur.courseIds.flatMap(id => content.courses.filter(c => c.id === id)).map(c => courseRow(t, c, false))}
                />}
            </section>
          ))}
          {loose.length > 0 && (
            <section className="trGroup" aria-label="Other courses">
              <h4 className="trGroupTitle">Other courses</h4>
              <p className="trGroupDefinition">Courses that are in no curriculum.</p>
              <TrainingList label="Other courses" openLabel={title => `Open ${title}`} Icon={BookFaceIcon} rows={loose.map(c => courseRow(t, c, false))} />
            </section>
          )}
        </TrainingPage>
      ),
    },
    { id: 'settings', label: 'Settings', Icon: GearIcon, end: true, surface: true, render: () => <ThemeSettingsPanel /> },
    { id: 'help', label: 'Help', Icon: HelpIcon, render: () => <HelpArticles names={TRAINING_HELP_NAMES} fallback={DESK_HELP} /> },
  ]
}

export function courseTabs(t: TrainingState, course: TrainingCourse): LevelTab[] {
  return [
    {
      id: 'modules', label: 'Modules', Icon: OutlineIcon,
      render: () => (
        <TrainingPage page="module" done={doneAction(t, course.id, course.title)}>
          {course.description && <p className="trAbout">{course.description}</p>}
          {course.modules.length === 0
            ? <TrainingEmpty>No modules yet.</TrainingEmpty>
            : <TrainingList
              label={`Modules of ${course.title}`} openLabel={title => `Open ${title}`} Icon={StackIcon}
              rows={course.modules.map(m => ({ id: m.id, title: m.title, detail: [m.description, plural(m.lessons.length, 'lesson')].filter(Boolean).join(' · '), onOpen: () => t.openModule(m.id), done: doneAction(t, m.id, m.title) }))}
            />}
        </TrainingPage>
      ),
    },
    {
      id: 'exams', label: 'Exams', Icon: TicketIcon,
      render: () => <TrainingPage page="exams"><TrainingAssessments label={`Exams of ${course.title}`} items={course.exams} progress={t.progress} none="No exams yet." /></TrainingPage>,
    },
    {
      id: 'projects', label: 'Projects', Icon: BriefcaseIcon,
      render: () => (
        <TrainingPage page="project">
          {course.projects.length === 0
            ? <TrainingEmpty>No projects yet.</TrainingEmpty>
            : <TrainingList
              label={`Projects of ${course.title}`} openLabel={title => `Open ${title}`} Icon={BriefcaseIcon}
              rows={course.projects.map(p => ({ id: p.id, title: p.title, detail: [p.description, plural(p.exerciseIds.length, 'exercise')].filter(Boolean).join(' · '), onOpen: () => t.openProject(p.id), done: doneAction(t, p.id, p.title) }))}
            />}
        </TrainingPage>
      ),
    },
  ]
}

export function moduleTabs(t: TrainingState, mod: TrainingModule): LevelTab[] {
  return [
    {
      id: 'lessons', label: 'Lessons', Icon: NoteIcon,
      render: () => (
        <TrainingPage page="lesson" done={doneAction(t, mod.id, mod.title)}>
          {mod.description && <p className="trAbout">{mod.description}</p>}
          {mod.lessons.length === 0
            ? <TrainingEmpty>No lessons yet.</TrainingEmpty>
            : <TrainingList
              label={`Lessons of ${mod.title}`} openLabel={title => `Open ${title}`} Icon={NoteIcon}
              rows={mod.lessons.map(l => ({ id: l.id, title: l.title, detail: l.description, onOpen: () => t.openLesson(l.id), done: doneAction(t, l.id, l.title) }))}
            />}
        </TrainingPage>
      ),
    },
    {
      id: 'tests', label: 'Tests', Icon: CheckboxIcon,
      render: () => <TrainingPage page="tests"><TrainingAssessments label={`Tests of ${mod.title}`} items={mod.tests} progress={t.progress} none="No tests yet." /></TrainingPage>,
    },
  ]
}

export function lessonTabs(t: TrainingState, lesson: TrainingLesson): LevelTab[] {
  return [
    {
      id: 'material', label: 'Material', Icon: PageIcon,
      render: () => (
        <TrainingPage page="lesson" done={doneAction(t, lesson.id, lesson.title)}>
          {lesson.description && <p className="trAbout">{lesson.description}</p>}
          {lesson.body.trim() === '' ? <TrainingEmpty>No material yet.</TrainingEmpty> : <TrainingMarkdown source={lesson.body} />}
        </TrainingPage>
      ),
    },
    {
      id: 'quizzes', label: 'Quizzes', Icon: QuestionIcon,
      render: () => <TrainingPage page="quizzes"><TrainingAssessments label={`Quizzes of ${lesson.title}`} items={lesson.quizzes} progress={t.progress} none="No quizzes yet." /></TrainingPage>,
    },
    {
      id: 'exercises', label: 'Exercises', Icon: RevisionIcon,
      render: () => (
        <TrainingPage page="exercise">
          {lesson.exercises.length === 0
            ? <TrainingEmpty>No exercises yet.</TrainingEmpty>
            : <TrainingList
              label={`Exercises of ${lesson.title}`} openLabel={title => `Open ${title}`} Icon={RevisionIcon}
              rows={lesson.exercises.map(e => ({ id: e.id, title: e.title, detail: e.description, onOpen: () => t.openExercise(e.id), done: doneAction(t, e.id, e.title) }))}
            />}
        </TrainingPage>
      ),
    },
  ]
}

export { doneAction }

// The Desk's one-line summary and a course's (what a level shows folded to Min).
export const deskLine = (t: TrainingState) => `${t.content.courses.filter(c => t.isEnrolled(c.id)).length} of ${plural(t.content.courses.length, 'course')} enrolled.`
export const courseLine = (t: TrainingState, course: TrainingCourse) => {
  const p = courseProgress(course, t.progress)
  return `${plural(p.modules, 'module')} and ${plural(p.projects, 'project')}; ${progressText(course, t.progress).toLowerCase()}.`
}

// The tab each level opens with. A constant, not the first of the tabs given: the hook of a level that is not on the path still runs (with no tabs),
// and the state it keeps from then on must be what the level has once it is.
const FIRST_TAB: Record<Exclude<TrainingLevel, 'practice'>, string> = { desk: 'courses', course: 'modules', module: 'lessons', lesson: 'material' }

// A level's tabs and the tiles they open. `tabs` is null for a level that is not on the path (folded to Min).
export function useTrainingTabs(level: Exclude<TrainingLevel, 'practice'>, tabs: LevelTab[] | null, size: 'min' | 'mid' | 'max') {
  const list = tabs ?? [{ id: FIRST_TAB[level], label: '', Icon: PageIcon, render: () => null }]
  // (The Course level's first tab was called Curriculum, and what was stored under its name is of no use to the tab that replaced it: a key of its own.)
  return useTabbedLevel({ storageKey: `scriblr.training.${level === 'course' ? 'courseTabs' : level}`, tabs: list, size: tabs ? size : 'min', defaultOpen: [FIRST_TAB[level]], defaultTab: FIRST_TAB[level] })
}
