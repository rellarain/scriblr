import OutlineEditor from '../outline/OutlineEditor'
import PlotSidebar from './PlotSidebar'

function PlanMode() {
  return (
    <div className="plan-mode">
      <div className="plan-mode__focal">
        <OutlineEditor />
      </div>
      <aside className="plan-mode__sidebar">
        <PlotSidebar />
      </aside>
    </div>
  )
}

export default PlanMode
