import LearningLevels from './learning/LearningLevels'
import type { LearningPath } from './learning/learningPath'
import './learning/learning.scss'

// Learning (LUI): five stacked levels -- the Desk (the courses enrolled in, and the catalog), the open Course, its Module, the Lesson and, deepest, the
// Practice (an exercise or a project) -- one focused (Max), the others Mid or Min (learning/). It has the Writer's `.wr` scope, so its levels
// and tiles take the same tokens.
// `startAt` is where it opens when nothing is stored yet (the design system's card).
function LUI({ startAt }: { startAt?: LearningPath }) {
  return (
    <main className="lUI wr">
      <LearningLevels startAt={startAt} />
    </main>
  )
}

export default LUI
