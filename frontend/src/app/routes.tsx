import { Navigate, Route, Routes } from 'react-router-dom'
import ProjectPicker from '../components/shared/ProjectPicker'
import ProjectShell from '../components/shared/ProjectShell'
import BrainstormMode from '../modes/brainstorm/BrainstormMode'
import DraftMode from '../modes/draft/DraftMode'
import OutlineMode from '../modes/outline/OutlineMode'
import ReadMode from '../modes/read/ReadMode'
import ReviseMode from '../modes/revise/ReviseMode'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ProjectPicker />} />
      <Route path="/project/:projectId" element={<ProjectShell />}>
        <Route index element={<Navigate to="outline" replace />} />
        <Route path="brainstorm" element={<BrainstormMode />} />
        <Route path="outline" element={<OutlineMode />} />
        <Route path="draft" element={<DraftMode />} />
        <Route path="draft/:sceneId" element={<DraftMode />} />
        <Route path="read" element={<ReadMode />} />
        <Route path="revise" element={<ReviseMode />} />
        <Route path="revise/:sceneId" element={<ReviseMode />} />
      </Route>
    </Routes>
  )
}

export default AppRoutes
