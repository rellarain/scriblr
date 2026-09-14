import type { WriterWorkspace } from './useWriterWorkspace'
import FocusedNodeEditor from './FocusedNodeEditor'
import PlotPanel from './PlotPanel'

export type ShelfSubTab =
  | 'projectEditor' | 'projectAnalytics' | 'projectSchedule' | 'projectHistory'
  | 'projectPlot' | 'projectOutline' | 'outlineTemplate' | 'seriesOutline' | 'bookOutline'
  | 'shelfSettings' | 'shelfHelp'

interface ShelfConsoleViewProps {
  subTab: ShelfSubTab
  workspace: WriterWorkspace
  label: string
  body: string
}

// Shelf Console's sub-tab dispatch: Project Outline and Project Plot are
// real (backend-connected); everything else is a placeholder per
// scrilbrPlan.md (no Project Editor/Analytics/Schedule/History backend
// field/endpoint wired up yet, no book-template concept, etc).
function ShelfConsoleView({ subTab, workspace, label, body }: ShelfConsoleViewProps) {
  if (subTab === 'projectOutline') {
    if (workspace.outlineStatus === 'loading') return <p className="feedbackCardMeta">Loading outline…</p>
    if (workspace.outlineStatus === 'error') {
      return <p className="feedbackCardMeta">{workspace.outlineError ?? 'Failed to load outline.'}</p>
    }
    if (!workspace.focusedNode) return <p className="feedbackCardMeta">No outline root found for this project.</p>
    return (
      <FocusedNodeEditor
        node={workspace.focusedNode}
        onUpdateField={workspace.updateOutlineNodeField}
        onDeleteNode={workspace.deleteOutlineNode}
        onToggleFlag={workspace.toggleNodeFlag}
        onAddNode={workspace.addOutlineNode}
      />
    )
  }

  if (subTab === 'projectPlot') {
    return (
      <PlotPanel
        plotStatus={workspace.plotStatus}
        plotError={workspace.plotError}
        plotSaving={workspace.plotSaving}
        plotSaveError={workspace.plotSaveError}
        focusedPlotNode={workspace.focusedPlotNode}
        focusedPlotChildren={workspace.focusedPlotChildren}
        plotAncestryChain={workspace.plotAncestryChain}
        onFocusPlotNode={workspace.focusPlotNode}
        onAddNode={workspace.addPlotNode}
        onUpdateField={workspace.updatePlotNodeField}
        onDeleteNode={workspace.deletePlotNode}
        onToggleFlag={workspace.togglePlotNodeFlag}
        onMoveUp={workspace.movePlotNodeUp}
        onMoveDown={workspace.movePlotNodeDown}
        onAddKeyword={workspace.addPlotKeyword}
        onRemoveKeyword={workspace.removePlotKeyword}
        onAddCustomFieldDef={workspace.addPlotCustomFieldDef}
        onRemoveCustomFieldDef={workspace.removePlotCustomFieldDef}
        onUpdateCustomFieldValue={workspace.updatePlotCustomFieldValue}
      />
    )
  }

  return (
    <>
      <h2>{label}</h2>
      <p>{body}</p>
    </>
  )
}

export default ShelfConsoleView
