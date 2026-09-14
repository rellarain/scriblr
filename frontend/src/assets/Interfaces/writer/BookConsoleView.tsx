import type { WriterWorkspace } from './useWriterWorkspace'
import FocusedNodeEditor from './FocusedNodeEditor'

export type BookSubTab =
  | 'outlineTemplate' | 'bookEditor' | 'arcOutline' | 'chapterOutline' | 'actOutline' | 'sceneOutline' | 'momentOutline'
  | 'bookSettings' | 'bookHelp'

const KIND_BY_BOOK_SUBTAB: Partial<Record<BookSubTab, 'book' | 'arc' | 'chapter' | 'act' | 'scene' | 'moment'>> = {
  bookEditor: 'book', arcOutline: 'arc', chapterOutline: 'chapter',
  actOutline: 'act', sceneOutline: 'scene', momentOutline: 'moment',
}

interface BookConsoleViewProps {
  subTab: BookSubTab
  workspace: WriterWorkspace
  label: string
  body: string
}

// Book Console's outline-kind sub-tabs (Arc/Chapter/Act/Scene/Moment
// Outline, plus Book Editor itself) all share the one FocusedNodeEditor --
// WUI.tsx's tab click already calls focusNearestOfKind before this
// re-renders, so focusedNode.kind should already match; the fallback
// message below only shows if no matching node exists yet in this book.
function BookConsoleView({ subTab, workspace, label, body }: BookConsoleViewProps) {
  const wantKind = KIND_BY_BOOK_SUBTAB[subTab]
  if (wantKind) {
    if (workspace.focusedNode?.kind === wantKind) {
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
    return <p className="feedbackCardMeta">Focus a {wantKind} node from the outline to edit it here.</p>
  }

  return (
    <>
      <h2>{label}</h2>
      <p>{body}</p>
    </>
  )
}

export default BookConsoleView
