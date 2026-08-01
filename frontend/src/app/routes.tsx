import { Route, Routes } from 'react-router-dom'
import ProjectPicker from '../components/shared/ProjectPicker'
import ProjectShell from '../components/shared/ProjectShell'
import ProjectWorkspace from '../modes/workspace/ProjectWorkspace'
import BookWorkspace from '../modes/workspace/BookWorkspace'
import ChapterWorkspace from '../modes/workspace/ChapterWorkspace'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ProjectPicker />} />
      <Route path="/project/:projectId" element={<ProjectShell />}>
        <Route index element={<ProjectWorkspace />} />
        <Route path="book/:bookId" element={<BookWorkspace />} />
        <Route path="book/:bookId/chapter/:chapterId" element={<ChapterWorkspace />} />
        <Route path="book/:bookId/chapter/:chapterId/moment/:momentId" element={<ChapterWorkspace />} />
      </Route>
    </Routes>
  )
}

export default AppRoutes
