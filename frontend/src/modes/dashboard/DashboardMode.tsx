import { useState } from 'react'
import ActivityPanel from './ActivityPanel'
import AnalyticsPanel from './AnalyticsPanel'
import ConfigurationPanel from './ConfigurationPanel'
import PlanPanel from './PlanPanel'
import SchedulePanel from './SchedulePanel'

type DashboardTab = 'configuration' | 'activity' | 'plan' | 'analytics' | 'schedule'

const TABS: { id: DashboardTab; label: string }[] = [
  { id: 'configuration', label: 'Configuration' },
  { id: 'activity', label: 'Activity' },
  { id: 'plan', label: 'Plan' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'schedule', label: 'Schedule' },
]

function DashboardMode() {
  const [tab, setTab] = useState<DashboardTab>('configuration')

  return (
    <div className="dashboard-mode">
      <nav className="dashboard-mode__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`dashboard-mode__tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="dashboard-mode__panel">
        {tab === 'configuration' && <ConfigurationPanel />}
        {tab === 'activity' && <ActivityPanel />}
        {tab === 'plan' && <PlanPanel />}
        {tab === 'analytics' && <AnalyticsPanel />}
        {tab === 'schedule' && <SchedulePanel />}
      </div>
    </div>
  )
}

export default DashboardMode
