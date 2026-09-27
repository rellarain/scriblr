import { useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon } from '../../../icons'
import type { ResourceNode, ResourceNodeKind } from '../../../../api/types'
import { CHILD_KIND } from './useResources'

const KIND_LABEL: Record<ResourceNodeKind, string> = {
  interface: 'Interface', console: 'Console', component: 'Component', feature: 'Feature',
}

// The Interface > Console > Component > Feature structural nav, shared by
// the Article Builder and the Quiz/Test/Exam Builder (they read the same
// tree, just show different content for whichever node is selected). A
// node's own expand/collapse caret sits at the row's right edge, after its
// label -- not before it.
function ResourceTree({ childrenOf, selectedId, onSelect, onAddChild, onRename, onDelete }: {
  childrenOf: (parentId: string | null) => ResourceNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (parentId: string | null, kind: ResourceNodeKind) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  function toggle(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderNode(node: ResourceNode, depth: number) {
    const kids = childrenOf(node.id)
    const hasChildren = kids.length > 0
    const childKind = CHILD_KIND[node.kind]
    const isOpen = !collapsed.has(node.id)
    const selected = node.id === selectedId
    return (
      <div key={node.id}>
        <div
          className={selected ? 'resTreeRow resTreeRow--selected' : 'resTreeRow'}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => onSelect(node.id)}
        >
          <input
            type="text" className="resTreeLabel" value={node.name} placeholder={`Untitled ${KIND_LABEL[node.kind].toLowerCase()}`}
            onClick={e => e.stopPropagation()}
            onChange={e => onRename(node.id, e.target.value)}
          />
          {confirmingDeleteId === node.id ? (
            <span className="resTreeConfirm" onClick={e => e.stopPropagation()}>
              <button type="button" className="toneBtn" onClick={() => { onDelete(node.id); setConfirmingDeleteId(null) }}>Confirm</button>
              <button type="button" className="toneBtn" onClick={() => setConfirmingDeleteId(null)}>Cancel</button>
            </span>
          ) : (
            <button
              type="button" className="resTreeIconBtn" aria-label={`Delete ${node.name || KIND_LABEL[node.kind]}`}
              onClick={e => { e.stopPropagation(); setConfirmingDeleteId(node.id) }}
            >
              <TrashIcon size={13} />
            </button>
          )}
          {childKind && (
            <button
              type="button" className="resTreeIconBtn" aria-label={`Add ${KIND_LABEL[childKind]} under ${node.name || KIND_LABEL[node.kind]}`}
              onClick={e => { e.stopPropagation(); if (collapsed.has(node.id)) toggle(node.id); onAddChild(node.id, childKind) }}
            >
              <PlusIcon size={13} />
            </button>
          )}
          {hasChildren ? (
            <button type="button" className="resTreeCaret" aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={e => { e.stopPropagation(); toggle(node.id) }}>
              {isOpen ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}
            </button>
          ) : (
            <span className="resTreeCaret" />
          )}
        </div>
        {hasChildren && isOpen && kids.map(kid => renderNode(kid, depth + 1))}
      </div>
    )
  }

  return (
    <div className="resTree" role="tree" aria-label="Interface, Console, Component, Feature">
      <div className="resTreeHeading">Interface &gt; Console &gt; Component &gt; Feature</div>
      {childrenOf(null).map(node => renderNode(node, 0))}
      <button type="button" className="resTreeAddRoot" onClick={() => onAddChild(null, 'interface')}>
        <PlusIcon size={13} /> Add interface
      </button>
    </div>
  )
}

export default ResourceTree
