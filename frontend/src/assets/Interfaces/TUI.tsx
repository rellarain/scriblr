import TrainingLevels from './training/TrainingLevels'
import type { TrainingPath } from './training/trainingPath'
import './training/training.scss'

// Training: five stacked levels -- the Desk (the courses enrolled in, and the catalog), the open Course, its Module, the Lesson and, deepest, the
// Practice (an exercise or a project) -- one focused (Max), the others Mid or Min (training/). It has the Writer's `.wr` scope, so its levels
// and tiles take the same tokens.
// `startAt` is where it opens when nothing is stored yet (the design system's card).
function TUI({ startAt }: { startAt?: TrainingPath }) {
  return (
    <main className="tUI wr">
      <TrainingLevels startAt={startAt} />
    </main>
  )
}

export default TUI
