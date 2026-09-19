import { useEffect, useRef, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { AuiConfigNode } from '../../../api/types'
import { CloseIcon } from '../../icons'
import type { AuiConfigTabKey, AuiConfigWorkspace } from './useAuiConfig'
import { useNodeKeys } from '../../../lib/nodeKeys'

interface AuiConfigEditorProps {
  tab: AuiConfigTabKey
  config: AuiConfigWorkspace
}

// Total children + grandchildren under a node (e.g. a console's components
// plus all of their features) -- the tree only goes 3 levels deep, so a
// plain recursive sum over childrenOf already stops there on its own.
function countDescendants(config: AuiConfigWorkspace, tab: AuiConfigTabKey, nodeId: string): number {
  const kids = config.childrenOf(tab, nodeId)
  return kids.reduce((sum, kid) => sum + 1 + countDescendants(config, tab, kid.id), 0)
}

// Shared by the editor's NodeCard and the read-only tree below -- same
// triangle, same collapsed/expanded behavior either way.
function CollapseCaretButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`auiConfigNodeCollapseBtn${collapsed ? ' auiConfigNodeCollapseBtn--collapsed' : ''}`}
      aria-label={collapsed ? 'Expand' : 'Collapse'}
      title={collapsed ? 'Expand' : 'Collapse'}
      onClick={onToggle}
    >
      <span className="auiConfigNodeCollapseTriangle" />
    </button>
  )
}

// One card at any of the 3 levels (console/component/feature) -- draggable
// via a dedicated handle (mirrors OutlineNodeRow.tsx's dnd-kit useSortable
// pattern: the handle carries {...attributes}{...listeners}, the card
// itself carries the transform/ref). Children render *inside* this same
// card (auiConfigNodeChildren), so a console visually envelopes its
// components, which in turn envelope their features. Console/component
// cards (onAddChild present) get a collapse caret in the title row and a
// footer row pairing their "+ Add child" button with delete; leaf feature
// cards have neither a caret nor a footer, so delete stays in the title row.
function NodeCard({ node, config, nestedItems, addChildLabel, onAddChild, autoFocus, onAutoFocused }: {
  node: AuiConfigNode
  config: AuiConfigWorkspace
  nestedItems?: React.ReactNode
  addChildLabel?: string
  onAddChild?: () => void
  autoFocus?: boolean
  onAutoFocused?: () => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const titleRef = useRef<HTMLInputElement | null>(null)

  // Right after this node is created, select its title input so the name
  // can be typed immediately -- fires once (onAutoFocused clears the
  // pending id in the parent so this doesn't refire on later re-renders).
  useEffect(() => {
    if (!autoFocus) return
    titleRef.current?.focus()
    titleRef.current?.select()
    onAutoFocused?.()
  }, [autoFocus, onAutoFocused])
  const collapsed = config.isCollapsed(node.id, node.kind)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id })
  const hasFooter = !!onAddChild
  const descendantCount = hasFooter ? countDescendants(config, node.tab as AuiConfigTabKey, node.id) : 0
  // Features always get a description field; consoles/components only get
  // one once they have a title -- an untitled console/component has
  // nothing to describe yet.
  const showIdea = node.kind === 'feature' || node.name.trim() !== ''
  const ideaRef = useRef<HTMLTextAreaElement | null>(null)

  function resizeIdea() {
    const el = ideaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Recompute height whenever the text itself changes...
  useEffect(() => { resizeIdea() }, [node.idea])

  // ...and also whenever the field's own width changes, e.g. AUI's
  // fully-expanded/half-screen/single-column size buttons -- those don't
  // change node.idea, just how the existing text wraps, so the effect
  // above alone won't catch them. Width-only guard avoids a feedback loop
  // from the height write above also triggering this observer.
  useEffect(() => {
    const el = ideaRef.current
    if (!el || !showIdea) return
    let lastWidth = el.offsetWidth
    const ro = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width
      if (width !== undefined && width !== lastWidth) {
        lastWidth = width
        resizeIdea()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [showIdea])

  // Once the description has some text, Shift+Enter (a new line; plain Enter
  // adds a sibling card, see lib/nodeKeys.ts) starts a new bulleted line
  // instead of a plain one -- the very first line stays plain until
  // there's something for a second line to continue from.
  function handleIdeaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.nativeEvent.isComposing) return
    const el = e.currentTarget
    if (el.value.trim() === '') return
    e.preventDefault()
    const { selectionStart, selectionEnd, value } = el
    const insert = '\n• '
    const nextValue = value.slice(0, selectionStart) + insert + value.slice(selectionEnd)
    config.updateNodeField(node.id, 'idea', nextValue)
    const nextCursor = selectionStart + insert.length
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = nextCursor })
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties

  const deleteControl = confirmingDelete ? (
    <span className="shelfConfirmRow">
      <button type="button" className="toneBtn" onClick={() => { config.deleteNode(node.id); setConfirmingDelete(false) }}>Confirm</button>
      <button type="button" className="toneBtn" onClick={() => setConfirmingDelete(false)}>Cancel</button>
    </span>
  ) : (
    <button type="button" className="auiConfigNodeDeleteBtn" aria-label="Delete" title="Delete" onClick={() => setConfirmingDelete(true)}>
      <CloseIcon size={14} />
    </button>
  )

  return (
    <div
      ref={setNodeRef}
      data-knode={node.id}
      style={style}
      className={isDragging ? `auiConfigNode auiConfigNode--${node.kind} auiConfigNode--dragging` : `auiConfigNode auiConfigNode--${node.kind}`}
    >
      <div className="auiConfigNodeMain">
        <span className="auiConfigNodeHandle" {...attributes} {...listeners}>⠿</span>
        <div className="auiConfigNodeBody">
          <div className="auiConfigNodeRow">
            <input
              className="statementField" data-kf=""
              placeholder={`New ${node.kind.charAt(0).toUpperCase()}${node.kind.slice(1)}`}
              value={node.name}
              ref={titleRef}
              onChange={e => config.updateNodeField(node.id, 'name', e.target.value)}
            />
            {hasFooter ? (
              <>
                <span className="auiConfigNodeCount">{descendantCount}</span>
                <CollapseCaretButton collapsed={collapsed} onToggle={() => config.toggleCollapsed(node.id, node.kind)} />
              </>
            ) : deleteControl}
          </div>
          {showIdea && (
            <textarea
              className="inlineNoteInput inlineNoteInput--idea" data-kf=""
              placeholder={node.kind === 'feature' ? 'Idea…' : 'Description…'}
              value={node.idea}
              rows={1}
              ref={ideaRef}
              onChange={e => config.updateNodeField(node.id, 'idea', e.target.value)}
              onKeyDown={handleIdeaKeyDown}
            />
          )}
          {hasFooter && (
            <div className="auiConfigNodeFooterRow">
              <AddForm label={addChildLabel!} onAdd={onAddChild!} />
              {deleteControl}
            </div>
          )}
        </div>
      </div>
      {hasFooter && !collapsed && nestedItems && <div className="auiConfigNodeChildren">{nestedItems}</div>}
    </div>
  )
}

function AddForm({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div className="channelAddForm">
      <button type="button" className="toneBtn" onClick={onAdd}>+ {label}</button>
    </div>
  )
}

// Read-only mirror of the editor's nested-card envelope (reuses
// .auiConfigNode/.auiConfigNodeChildren directly so consoles and
// components look identical to the editor, minus every interactive
// control besides the collapse caret), except features -- the leaf level
// -- render as a plain bulleted list inside their component's card
// instead of their own cards, and are never collapsible themselves.
function ReadOnlyComponent({ node, tab, config }: { node: AuiConfigNode; tab: AuiConfigTabKey; config: AuiConfigWorkspace }) {
  const collapsed = config.isCollapsed(node.id, node.kind)
  const features = config.childrenOf(tab, node.id, 'published')
  return (
    <div className="auiConfigNode auiConfigNode--component">
      <div className="auiConfigReadOnlyTitleRow">
        <div className="auiConfigReadOnlyTitle auiConfigReadOnlyTitle--component">{node.name || 'Untitled component'}</div>
        {features.length > 0 && <CollapseCaretButton collapsed={collapsed} onToggle={() => config.toggleCollapsed(node.id, node.kind)} />}
      </div>
      {node.idea && <div className="auiConfigReadOnlyIdea">{node.idea}</div>}
      {features.length > 0 && !collapsed && (
        <ul className="auiConfigReadOnlyFeatureList">
          {features.map(featureNode => (
            <li key={featureNode.id} className="auiConfigReadOnlyFeatureItem">
              <span className="auiConfigReadOnlyTitle auiConfigReadOnlyTitle--feature">{featureNode.name || 'Untitled feature'}</span>
              {featureNode.idea && <div className="auiConfigReadOnlyFeatureIdea">{featureNode.idea}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ReadOnlyConsole({ node, tab, config }: { node: AuiConfigNode; tab: AuiConfigTabKey; config: AuiConfigWorkspace }) {
  const collapsed = config.isCollapsed(node.id, node.kind)
  const components = config.childrenOf(tab, node.id, 'published')
  return (
    <div className="auiConfigNode auiConfigNode--console">
      <div className="auiConfigReadOnlyTitleRow">
        <div className="auiConfigReadOnlyTitle auiConfigReadOnlyTitle--console">{node.name || 'Untitled console'}</div>
        {components.length > 0 && <CollapseCaretButton collapsed={collapsed} onToggle={() => config.toggleCollapsed(node.id, node.kind)} />}
      </div>
      {node.idea && <div className="auiConfigReadOnlyIdea">{node.idea}</div>}
      {components.length > 0 && !collapsed && (
        <div className="auiConfigNodeChildren">
          {components.map(componentNode => (
            <ReadOnlyComponent key={componentNode.id} node={componentNode} tab={tab} config={config} />
          ))}
        </div>
      )}
    </div>
  )
}

// The read-only view shows the PUBLISHED copy (the draft, for a tab that was never published).
export function AuiConfigReadOnly({ tab, config }: AuiConfigEditorProps) {
  const consoles = config.childrenOf(tab, null, 'published')
  return (
    <div className="aUIOutline aUIOutline--readOnly">
      {config.status === 'loading' && <p className="feedbackCardMeta">Loading configuration…</p>}
      {config.status === 'error' && <p className="feedbackCardMeta">{config.error ?? 'Failed to load configuration.'}</p>}
      {consoles.length === 0 && config.status === 'idle' && <p className="feedbackCardMeta">No consoles yet.</p>}
      {consoles.map(consoleNode => (
        <ReadOnlyConsole key={consoleNode.id} node={consoleNode} tab={tab} config={config} />
      ))}
    </div>
  )
}

function AuiConfigEditor({ tab, config }: AuiConfigEditorProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const consoles = config.childrenOf(tab, null)

  // Keyboard shortcuts (lib/nodeKeys.ts): consoles are the top-level list;
  // Ctrl+Enter on a feature adds a component after its component, on a
  // component a console after its console.
  const keys = useNodeKeys({
    parentOf: id => config.findNode(id)?.parentId ?? null,
    siblingsOf: id => {
      const n = config.findNode(id)
      return n ? config.childrenOf(tab, n.parentId).map(c => c.id) : [id]
    },
    isEmpty: id => {
      const n = config.findNode(id)
      return !n || (n.name.trim() === '' && n.idea.trim() === '' && config.childrenOf(tab, id).length === 0)
    },
    createSibling: id => {
      const n = config.findNode(id)
      return n ? config.addNode(tab, n.parentId, n.kind, id) : null
    },
    createParentSibling: id => {
      const n = config.findNode(id)
      const parent = n?.parentId ? config.findNode(n.parentId) : undefined
      return parent ? config.addNode(tab, parent.parentId, parent.kind, parent.id) : null
    },
    canCreateParentSibling: id => Boolean(config.findNode(id)?.parentId),
    remove: id => config.deleteNode(id),
  })
  // Tracks the id of a just-created node so its NodeCard can select its
  // title input once it mounts, then clears itself (see NodeCard's
  // autoFocus effect) so it doesn't refire on later re-renders.
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  const clearFocusNodeId = () => setFocusNodeId(null)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeNode = config.findNode(String(active.id))
    if (!activeNode) return
    const siblings = config.childrenOf(tab, activeNode.parentId)
    const ids = siblings.map(s => s.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    ids.splice(newIndex, 0, ids.splice(oldIndex, 1)[0])
    config.reorderNodes(tab, activeNode.parentId, ids)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="aUIOutline" onKeyDown={keys.onKeyDown}>
        {config.status === 'loading' && <p className="feedbackCardMeta">Loading configuration…</p>}
        {config.status === 'error' && <p className="feedbackCardMeta">{config.error ?? 'Failed to load configuration.'}</p>}
        {config.saveError && <p className="feedbackCardMeta">{config.saveError}</p>}

        <SortableContext items={consoles.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {consoles.map(consoleNode => {
            const components = config.childrenOf(tab, consoleNode.id)
            return (
              <NodeCard
                key={consoleNode.id}
                node={consoleNode}
                config={config}
                addChildLabel="Add component"
                onAddChild={() => setFocusNodeId(config.addNode(tab, consoleNode.id, 'component'))}
                autoFocus={consoleNode.id === focusNodeId}
                onAutoFocused={clearFocusNodeId}
                nestedItems={
                  <SortableContext items={components.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    {components.map(componentNode => {
                      const features = config.childrenOf(tab, componentNode.id)
                      return (
                        <NodeCard
                          key={componentNode.id}
                          node={componentNode}
                          config={config}
                          addChildLabel="Add feature"
                          onAddChild={() => setFocusNodeId(config.addNode(tab, componentNode.id, 'feature'))}
                          autoFocus={componentNode.id === focusNodeId}
                          onAutoFocused={clearFocusNodeId}
                          nestedItems={
                            <SortableContext items={features.map(f => f.id)} strategy={verticalListSortingStrategy}>
                              {features.map(featureNode => (
                                <NodeCard
                                  key={featureNode.id}
                                  node={featureNode}
                                  config={config}
                                  autoFocus={featureNode.id === focusNodeId}
                                  onAutoFocused={clearFocusNodeId}
                                />
                              ))}
                            </SortableContext>
                          }
                        />
                      )
                    })}
                  </SortableContext>
                }
              />
            )
          })}
        </SortableContext>
        <AddForm label="Add console" onAdd={() => setFocusNodeId(config.addNode(tab, null, 'console'))} />
      </div>
    </DndContext>
  )
}

export default AuiConfigEditor
