import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useProject } from '../../api/projects'

const MODE_TABS = [
  { path: 'plan', label: 'Plan' },
  { path: 'draft', label: 'Draft' },
  { path: 'read', label: 'Read' },
  { path: 'revise', label: 'Revise' },
]

function ProjectShell() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading, error } = useProject(projectId)

  return (
    <div className="project-shell">
      <aside className="project-shell__sidebar">
        <NavLink to="/" className="project-shell__back">
          ← Projects
        </NavLink>
        <h2 className="project-shell__title">
          {isLoading ? 'Loading…' : data?.index.title ?? 'Untitled'}
        </h2>
        <nav className="project-shell__nav">
          {MODE_TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                isActive ? 'project-shell__nav-link is-active' : 'project-shell__nav-link'
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        {data?.warnings.map((warning) => (
          <p key={warning} className="project-shell__warning">
            ⚠ {warning}
          </p>
        ))}
      </aside>
      <main className="project-shell__content">
        {error ? <p className="project-shell__error">Failed to load project.</p> : <Outlet />}
      </main>
    </div>
  )
}

export default ProjectShell
