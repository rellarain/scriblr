import { useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useProject } from '../../api/projects'
import { IconDashboard, IconDraft, IconOutline, IconRead, IconRevise } from './NavIcons'

const MODE_TABS = [
  { path: 'plan', label: 'Outline', Icon: IconOutline },
  { path: 'draft', label: 'Draft', Icon: IconDraft },
  { path: 'read', label: 'Read', Icon: IconRead },
  { path: 'revise', label: 'Revise', Icon: IconRevise },
  { path: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
]

const COLLAPSED_STORAGE_KEY = 'scriblr:navCollapsed'

function ProjectShell() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading, error } = useProject(projectId)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_STORAGE_KEY) !== '0')

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <div className={`project-shell${collapsed ? ' project-shell--collapsed' : ''}`}>
      <aside className="project-shell__sidebar">
        <button
          type="button"
          className="project-shell__collapse-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? '»' : '«'}
        </button>
        <NavLink to="/" className="project-shell__back" title="Back to projects">
          {collapsed ? '←' : '← Projects'}
        </NavLink>
        {!collapsed && (
          <h2 className="project-shell__title">
            {isLoading ? 'Loading…' : data?.index.title ?? 'Untitled'}
          </h2>
        )}
        <nav className="project-shell__nav">
          {MODE_TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                isActive ? 'project-shell__nav-link is-active' : 'project-shell__nav-link'
              }
              title={tab.label}
            >
              <tab.Icon />
              {!collapsed && <span className="project-shell__nav-label">{tab.label}</span>}
            </NavLink>
          ))}
        </nav>
        {!collapsed &&
          data?.warnings.map((warning) => (
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
