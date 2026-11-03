import {
  BookFaceIcon, BookOpenIcon, BriefcaseIcon, CatalogIcon, CheckIcon, CheckboxIcon, GearIcon, HelpIcon, NoteIcon, OutlineIcon, PageIcon, PlusIcon, QuestionIcon, RevisionIcon, StackIcon, TicketIcon,
} from '../../icons'
import ThemeSettingsPanel from '../../../theme/ThemeSettingsPanel'
import HelpArticles from '../writer/levels/HelpArticles'
import { useTabbedLevel, type LevelTab } from '../writer/levels/LevelTabs'
import { TrainingEmpty, TrainingList, TrainingPage } from './TrainingPage'
import { COURSES, CURRICULA, type TrainingCourse, type TrainingLesson, type TrainingModule } from './trainingSeed'
import { TRAINING_PAGES } from './trainingPages'
import type { TrainingLevel } from './trainingPath'
import type { TrainingState } from './useTrainingState'

// Each level's tabs: at Mid one tab at a time, at Max a tile for each (writer/levels/LevelTabs.tsx, the same tabbed level as the Writer's).
// The page behind a tab says what it is and lists what is on it; what there is to open (a module, a lesson) opens the next level.

const DESK_HELP = 'The Training desk shows the courses you are enrolled in; the catalog lists every course. Open a course to see its curriculum, exams and projects, then a module for its lessons and tests, and a lesson for its material, quizzes and exercises.'
export const TRAINING_HELP_NAMES = ['training', 'desk']

const courseRow = (t: TrainingState, c: TrainingCourse, withEnrol: boolean) => ({
  id: c.id, title: c.title, detail: c.blurb, onOpen: () => t.openCourse(c.id),
  ...(withEnrol
    ? { action: t.isEnrolled(c.id)
      ? { label: `Leave ${c.title}`, Icon: CheckIcon, pressed: true, onClick: () => t.toggleEnrolled(c.id) }
      : { label: `Enrol in ${c.title}`, Icon: PlusIcon, pressed: false, onClick: () => t.toggleEnrolled(c.id) } }
    : {}),
})

export function deskTabs(t: TrainingState): LevelTab[] {
  const enrolled = COURSES.filter(c => t.isEnrolled(c.id))
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
          {CURRICULA.map(cur => (
            <section key={cur.id} className="trGroup" aria-label={cur.title}>
              <h4 className="trGroupTitle">{cur.title}</h4>
              <p className="trGroupDefinition" title={TRAINING_PAGES.curriculum.definition}>{cur.blurb}</p>
              <TrainingList label={`Courses of ${cur.title}`} openLabel={title => `Open ${title}`} Icon={BookFaceIcon} rows={cur.courses.map(c => courseRow(t, c, true))} />
            </section>
          ))}
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
        <TrainingPage page="module">
          <TrainingList
            label={`Modules of ${course.title}`} openLabel={title => `Open ${title}`} Icon={StackIcon}
            rows={course.modules.map(m => ({ id: m.id, title: m.title, detail: `${m.lessons.length} ${m.lessons.length === 1 ? 'lesson' : 'lessons'}`, onOpen: () => t.openModule(m.id) }))}
          />
        </TrainingPage>
      ),
    },
    { id: 'exams', label: 'Exams', Icon: TicketIcon, render: () => <TrainingPage page="exams"><TrainingEmpty>No exams yet.</TrainingEmpty></TrainingPage> },
    {
      id: 'projects', label: 'Projects', Icon: BriefcaseIcon,
      render: () => (
        <TrainingPage page="project">
          <TrainingList label={`Projects of ${course.title}`} openLabel={title => `Open ${title}`} Icon={BriefcaseIcon} rows={course.projects.map(p => ({ id: p.id, title: p.title, onOpen: () => t.openProject(p.id) }))} />
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
        <TrainingPage page="lesson">
          <TrainingList label={`Lessons of ${mod.title}`} openLabel={title => `Open ${title}`} Icon={NoteIcon} rows={mod.lessons.map(l => ({ id: l.id, title: l.title, onOpen: () => t.openLesson(l.id) }))} />
        </TrainingPage>
      ),
    },
    { id: 'tests', label: 'Tests', Icon: CheckboxIcon, render: () => <TrainingPage page="tests"><TrainingEmpty>No tests yet.</TrainingEmpty></TrainingPage> },
  ]
}

export function lessonTabs(t: TrainingState, lesson: TrainingLesson): LevelTab[] {
  return [
    { id: 'material', label: 'Material', Icon: PageIcon, render: () => <TrainingPage page="lesson"><TrainingEmpty>No material yet.</TrainingEmpty></TrainingPage> },
    { id: 'quizzes', label: 'Quizzes', Icon: QuestionIcon, render: () => <TrainingPage page="quizzes"><TrainingEmpty>No quizzes yet.</TrainingEmpty></TrainingPage> },
    {
      id: 'exercises', label: 'Exercises', Icon: RevisionIcon,
      render: () => (
        <TrainingPage page="exercise">
          <TrainingList label={`Exercises of ${lesson.title}`} openLabel={title => `Open ${title}`} Icon={RevisionIcon} rows={lesson.exercises.map(e => ({ id: e.id, title: e.title, onOpen: () => t.openExercise(e.id) }))} />
        </TrainingPage>
      ),
    },
  ]
}

// The tab each level opens with. A constant, not the first of the tabs given: the hook of a level that is not on the path still runs (with no tabs),
// and the state it keeps from then on must be what the level has once it is.
const FIRST_TAB: Record<Exclude<TrainingLevel, 'practice'>, string> = { desk: 'courses', course: 'modules', module: 'lessons', lesson: 'material' }

// A level's tabs and the tiles they open. `tabs` is null for a level that is not on the path (folded to Min).
export function useTrainingTabs(level: Exclude<TrainingLevel, 'practice'>, tabs: LevelTab[] | null, size: 'min' | 'mid' | 'max') {
  const list = tabs ?? [{ id: FIRST_TAB[level], label: '', Icon: PageIcon, render: () => null }]
  return useTabbedLevel({ storageKey: `scriblr.training.${level}`, tabs: list, size: tabs ? size : 'min', defaultOpen: [FIRST_TAB[level]], defaultTab: FIRST_TAB[level] })
}
