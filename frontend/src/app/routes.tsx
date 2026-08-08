import { Route, Routes } from 'react-router-dom'
import ProjectPicker from '../components/shared/ProjectPicker'
import ProjectShell from '../components/shared/ProjectShell'
import BookFaceWorkspace from '../modes/workspace/BookFaceWorkspace'
import ChapterPageWorkspace from '../modes/workspace/ChapterPageWorkspace'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ProjectPicker />} />
      <Route path="/project/:projectId" element={<ProjectShell />}>
        <Route path="book/:bookId" element={<BookFaceWorkspace />} />
        <Route path="book/:bookId/chapter/:chapterId" element={<ChapterPageWorkspace />} />
      </Route>
    </Routes>
  )
}

export default AppRoutes
