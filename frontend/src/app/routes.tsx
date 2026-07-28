import { Navigate, Route, Routes } from 'react-router-dom'
import ProjectPicker from '../components/shared/ProjectPicker'
import ProjectShell from '../components/shared/ProjectShell'
import DashboardMode from '../modes/dashboard/DashboardMode'
import DraftMode from '../modes/draft/DraftMode'
import PlanMode from '../modes/plan/PlanMode'
import ReadMode from '../modes/read/ReadMode'
import ReviseMode from '../modes/revise/ReviseMode'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ProjectPicker />} />
      <Route path="/project/:projectId" element={<ProjectShell />}>
        <Route index element={<Navigate to="plan" replace />} />
        <Route path="plan" element={<PlanMode />} />
        <Route path="draft" element={<DraftMode />} />
        <Route path="draft/:chapterId" element={<DraftMode />} />
        <Route path="draft/:chapterId/:momentId" element={<DraftMode />} />
        <Route path="read" element={<ReadMode />} />
        <Route path="read/:chapterId" element={<ReadMode />} />
        <Route path="revise" element={<ReviseMode />} />
        <Route path="revise/:momentId" element={<ReviseMode />} />
        <Route path="dashboard" element={<DashboardMode />} />
      </Route>
    </Routes>
  )
}

export default AppRoutes
