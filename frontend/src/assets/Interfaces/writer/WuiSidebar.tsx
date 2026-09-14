import { useState } from 'react'
import type { OutlineNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { PageIcon, PagesIcon } from '../../icons'

interface WuiSidebarProps {
  workspace: WriterWorkspace
  onNavigate: (kind: 'opening' | 'flipping' | null, after: () => void) => void
}

// A single node/project entry within one of the sidebar's horizontal
// shelves -- the compact spine visual is sidebar-only (see .sidebarSpine
// in App.scss), unlike the plain rows the main-screen editors use now.
function SidebarSpine({
  title, active, color, onSelect, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  title: string
  active: boolean
  color?: string | null
  onSelect: () => void
  onDelete: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="sidebarSpineWrap">
      {(onMoveUp || onMoveDown) && (
        <div className="shelfMoveRow">
          <button type="button" className="tonePriorityMoveBtn" disabled={!canMoveUp} onClick={onMoveUp}>▲</button>
          <button type="button" className="tonePriorityMoveBtn" disabled={!canMoveDown} onClick={onMoveDown}>▼</button>
        </div>
      )}
      <button
        type="button"
        className={active ? 'sidebarSpine sidebarSpine--active' : 'sidebarSpine'}
        style={color ? { backgroundColor: color } : undefined}
        onClick={onSelect}
      >
        <span>{title}</span>
      </button>
      {confirmingDelete ? (
        <span className="shelfConfirmRow">
          <button type="button" className="toneBtn" onClick={() => { onDelete(); setConfirmingDelete(false) }}>Confirm</button>
          <button type="button" className="toneBtn" onClick={() => setConfirmingDelete(false)}>Cancel</button>
        </span>
      ) : (
        <button type="button" className="toneBtn shelfDeleteBtn" onClick={() => setConfirmingDelete(true)}>Delete</button>
      )}
    </div>
  )
}

// "You are here" header row for a panel's current node at that level --
// clickable to jump back to editing it after drilling into one of its
// children below. No move/delete here; those live on its own row one
// panel up, where it appears as a sibling instead.
function HeaderEntry({ node, onSelect }: { node: OutlineNode; onSelect: () => void }) {
  return (
    <button type="button" className="ancestryBreadcrumbRow" onClick={onSelect}>
      <span className="outlineNodeKindBadge">{node.kind}</span>
      <span>{node.title}</span>
    </button>
  )
}

// The entire WUI navigation surface -- 4 stacked panels, each a header
// entry (the current node at that level) plus a horizontal shelf of its
// direct children (a single-level picker; drilling into a child updates
// which node is "current" and the shelf refreshes to its own children).
// bookSidebar/chapterSidebar are dynamic: they track whichever book-or-arc
// (resp. chapter/act/scene) node is nearest the current focus, so stepping
// through an intermediate kind like arc reuses the same panel.
function WuiSidebar({ workspace, onNavigate }: WuiSidebarProps) {
  const {
    hasOpenProject, activeProject, projects, projectsStatus, projectsError,
    ancestryChain, focusedNode, focusNode, backToShelves,
    childrenByParentId, chapterAncestorId, pageMode,
    moveOutlineNodeUp, moveOutlineNodeDown, deleteOutlineNode,
    loadProjects, createProject, openProject, deleteProject,
    viewChapterDraft, viewChapterPages,
  } = workspace

  const [newProjectTitle, setNewProjectTitle] = useState('')

  function handleCreateProject() {
    if (!newProjectTitle.trim()) return
    createProject(newProjectTitle.trim())
    setNewProjectTitle('')
  }

  function navigateToNode(node: OutlineNode) {
    const isChapterMove = node.kind === 'chapter' || chapterAncestorId != null
    onNavigate(isChapterMove ? 'opening' : null, () => focusNode(node.id))
  }

  function togglePageMode(mode: 'draft' | 'preview') {
    if (pageMode === mode) return
    onNavigate('flipping', () => (mode === 'draft' ? viewChapterDraft() : viewChapterPages()))
  }

  const chain = focusedNode ? [...ancestryChain, focusedNode] : ancestryChain
  const rootEntry = chain.find(n => n.parentId === null)
  const bookOrArcEntries = chain.filter(n => n.kind === 'book' || n.kind === 'arc')
  const nearestBookOrArc = bookOrArcEntries[bookOrArcEntries.length - 1]
  const chapterSpanEntries = chain.filter(n => n.kind === 'chapter' || n.kind === 'act' || n.kind === 'scene')
  const nearestChapterSpan = chapterSpanEntries[chapterSpanEntries.length - 1]

  const activeChildId = (parentId: string) => chain.find(n => n.parentId === parentId)?.id

  const rootChildren = rootEntry ? childrenByParentId.get(rootEntry.id) ?? [] : []
  const bookOrArcChildren = nearestBookOrArc ? childrenByParentId.get(nearestBookOrArc.id) ?? [] : []
  const chapterSpanChildren = nearestChapterSpan ? childrenByParentId.get(nearestChapterSpan.id) ?? [] : []

  function renderChildShelf(children: OutlineNode[], activeId: string | undefined) {
    return (
      <div className="sidebarShelf">
        {children.map((child, index) => (
          <SidebarSpine
            key={child.id}
            title={child.title}
            color={child.color}
            active={child.id === activeId}
            onSelect={() => navigateToNode(child)}
            onDelete={() => deleteOutlineNode(child.id)}
            onMoveUp={() => moveOutlineNodeUp(child.id)}
            onMoveDown={() => moveOutlineNodeDown(child.id)}
            canMoveUp={index > 0}
            canMoveDown={index < children.length - 1}
          />
        ))}
      </div>
    )
  }

  return (
    <aside className="wuiSidebar" aria-label="Writer navigation">
      <div className="projectsConsole wuiSidebarPanel">
        <div className="wuiSidebarPanelLabel">Projects</div>
        {hasOpenProject && (
          <button type="button" className="ancestryBreadcrumbBack" onClick={backToShelves}>← Close project</button>
        )}
        {projectsStatus === 'loading' && <p className="feedbackCardMeta">Loading projects…</p>}
        {projectsStatus === 'error' && (
          <p className="feedbackCardMeta">
            {projectsError ?? 'Failed to load projects.'}{' '}
            <button type="button" className="toneBtn" onClick={loadProjects}>Retry</button>
          </p>
        )}
        <div className="sidebarShelf">
          {projects.map(p => (
            <SidebarSpine
              key={p.projectId}
              title={p.title}
              active={p.projectId === activeProject?.projectId}
              onSelect={() => openProject(p.projectId)}
              onDelete={() => deleteProject(p.projectId)}
            />
          ))}
        </div>
        <div className="channelAddForm">
          <input
            value={newProjectTitle} placeholder="New project title…"
            onChange={e => setNewProjectTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
          />
          <button type="button" className="toneBtn" disabled={!newProjectTitle.trim()} onClick={handleCreateProject}>+ New project</button>
        </div>
      </div>

      {hasOpenProject && rootEntry && (
        <div className="shelfSidebar wuiSidebarPanel">
          <div className="wuiSidebarPanelLabel">Shelf</div>
          <HeaderEntry node={rootEntry} onSelect={() => navigateToNode(rootEntry)} />
          {renderChildShelf(rootChildren, activeChildId(rootEntry.id))}
        </div>
      )}

      {/* Skipped when nearestBookOrArc === rootEntry -- a single-book
          project's root is kind 'book' directly (no series wrapper), so
          shelfSidebar's own header/shelf already covers it; showing both
          panels would just duplicate the same node. */}
      {nearestBookOrArc && nearestBookOrArc.id !== rootEntry?.id && (
        <div className="bookSidebar wuiSidebarPanel">
          <div className="wuiSidebarPanelLabel">Book</div>
          <HeaderEntry node={nearestBookOrArc} onSelect={() => navigateToNode(nearestBookOrArc)} />
          {renderChildShelf(bookOrArcChildren, activeChildId(nearestBookOrArc.id))}
        </div>
      )}

      {nearestChapterSpan && (
        <div className="chapterSidebar wuiSidebarPanel">
          <div className="wuiSidebarPanelLabel">
            Chapter
            {chapterAncestorId != null && (
              <span className="bookTabsPageModeToggle">
                <button
                  type="button"
                  className={pageMode === 'draft' ? 'subTabBtn subTabBtn--active' : 'subTabBtn'}
                  aria-label="Draft" title="Draft"
                  onClick={() => togglePageMode('draft')}
                >
                  <PageIcon size={14} />
                </button>
                <button
                  type="button"
                  className={pageMode === 'preview' ? 'subTabBtn subTabBtn--active' : 'subTabBtn'}
                  aria-label="Preview" title="Preview"
                  onClick={() => togglePageMode('preview')}
                >
                  <PagesIcon size={14} />
                </button>
              </span>
            )}
          </div>
          <HeaderEntry node={nearestChapterSpan} onSelect={() => navigateToNode(nearestChapterSpan)} />
          {renderChildShelf(chapterSpanChildren, activeChildId(nearestChapterSpan.id))}
        </div>
      )}
    </aside>
  )
}

export default WuiSidebar
