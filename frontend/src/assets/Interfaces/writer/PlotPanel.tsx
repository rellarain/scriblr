import type { FlagType, PlotNode, PlotNodeKind } from '../../../api/types'
import PlotNodeEditor from './PlotNodeEditor'

interface PlotPanelProps {
  plotStatus: 'idle' | 'loading' | 'error'
  plotError?: string
  plotSaving: boolean
  plotSaveError?: string
  focusedPlotNode?: PlotNode
  focusedPlotChildren: PlotNode[]
  plotAncestryChain: PlotNode[]
  onFocusPlotNode: (nodeId: string | null) => void
  onAddNode: (parentId: string | null, kind: PlotNodeKind) => void
  onUpdateField: (nodeId: string, field: 'title' | 'body', value: string) => void
  onDeleteNode: (nodeId: string) => void
  onToggleFlag: (nodeId: string, type: FlagType) => void
  onMoveUp: (nodeId: string) => void
  onMoveDown: (nodeId: string) => void
  onAddKeyword: (nodeId: string, keyword: string) => void
  onRemoveKeyword: (nodeId: string, keyword: string) => void
  onAddCustomFieldDef: (nodeId: string, name: string) => void
  onRemoveCustomFieldDef: (nodeId: string, fieldId: string) => void
  onUpdateCustomFieldValue: (nodeId: string, fieldId: string, value: string) => void
}

// Shelf Console's "Project Plot" component -- container for navigating
// plot categories/subcategories/plotlines/plotpoints, real and
// backend-connected. Unlike the outline (whose navigation now lives in
// WuiSidebar), the plot tree stays self-contained here.
function PlotPanel({
  plotStatus, plotError, plotSaving, plotSaveError,
  focusedPlotNode, focusedPlotChildren, plotAncestryChain,
  onFocusPlotNode, onAddNode, onUpdateField, onDeleteNode, onToggleFlag,
  onMoveUp, onMoveDown, onAddKeyword, onRemoveKeyword,
  onAddCustomFieldDef, onRemoveCustomFieldDef, onUpdateCustomFieldValue,
}: PlotPanelProps) {
  return (
    <div>
      <div className="wUIScreenHeader">
        <h2 className="wUIScreenTitle">Plot</h2>
        {plotSaving && <span className="wUISavingIndicator">Saving…</span>}
      </div>

      {plotSaveError && <p className="outlineWarningBanner">{plotSaveError}</p>}

      <nav className="plotBreadcrumb" aria-label="Plot ancestry">
        <button type="button" className="ancestryBreadcrumbBack" onClick={() => onFocusPlotNode(null)}>
          ← All categories
        </button>
        {plotAncestryChain.map(node => (
          <button
            key={node.id} type="button" className="ancestryBreadcrumbRow"
            onClick={() => onFocusPlotNode(node.id)}
          >
            <span className="plotNodeKindBadge">{node.kind}</span>
            <span>{node.title}</span>
          </button>
        ))}
      </nav>

      {plotStatus === 'loading' && <p className="feedbackCardMeta">Loading plot…</p>}
      {plotStatus === 'error' && <p className="feedbackCardMeta">{plotError ?? 'Failed to load plot.'}</p>}

      {plotStatus === 'idle' && (
        <PlotNodeEditor
          node={focusedPlotNode}
          childNodes={focusedPlotChildren}
          ancestryChain={plotAncestryChain}
          onUpdateField={onUpdateField}
          onDeleteNode={onDeleteNode}
          onToggleFlag={onToggleFlag}
          onAddNode={onAddNode}
          onFocusNode={onFocusPlotNode}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onAddKeyword={onAddKeyword}
          onRemoveKeyword={onRemoveKeyword}
          onAddCustomFieldDef={onAddCustomFieldDef}
          onRemoveCustomFieldDef={onRemoveCustomFieldDef}
          onUpdateCustomFieldValue={onUpdateCustomFieldValue}
        />
      )}
    </div>
  )
}

export default PlotPanel
