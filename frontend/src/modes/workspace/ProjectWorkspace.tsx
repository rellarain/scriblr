import { useState } from 'react'
import PlotSidebar from '../plan/PlotSidebar'
import ConfigurationPanel from './ConfigurationPanel'
import SchedulePanel from './SchedulePanel'
import ProjectStatsPanel from './ProjectStatsPanel'

type ProjectTab = 'plot' | 'schedule' | 'stats'

const TABS: { id: ProjectTab; label: string }[] = [
  { id: 'plot', label: 'Plot' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'stats', label: 'Stats' },
]

// Project-level main content: shown when nothing more specific (a book or
// chapter) is selected in the sidebar -- categories/plotlines/plotpoints,
// project-wide goals + schedule config, and a condensed stats panel.
function ProjectWorkspace() {
  const [tab, setTab] = useState<ProjectTab>('plot')

  return (
    <div className="project-workspace">
      <nav className="project-workspace__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`project-workspace__tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="project-workspace__panel">
        {tab === 'plot' && <PlotSidebar />}
        {tab === 'schedule' && (
          <div className="project-workspace__schedule">
            <ConfigurationPanel />
            <SchedulePanel />
          </div>
        )}
        {tab === 'stats' && <ProjectStatsPanel />}
      </div>
    </div>
  )
}

export default ProjectWorkspace
