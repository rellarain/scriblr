import { useState, type KeyboardEvent } from 'react'
import { addResourceNode, deleteResourceNode, renameResourceNode, reorderResourceNodes } from '../../../../api/resourcesApi'
import type { ResourceNode, ResourcesFile } from '../../../../api/types'
import { setChannels, useChannels } from '../../../../channels/channelStore'
import { CHILD_KIND, KIND_LABEL, childrenOf, movedBefore, nudged, type ChannelIndex } from '../../../../channels/channelTree'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, CloseIcon, GripIcon, PlusIcon, TrashIcon } from '../../../icons'
import { useReorder } from '../plot/useReorder'
import './channels.scss'

// Configuration > Channels: the app's one interface > console > component > feature list (the channel list), which feedback,
// plans, chats, queues and the Resources guides all point at. Admins rename, add, drag into order (Alt+Up / Alt+Down for the
// keyboard) and delete; a node something still points at cannot be deleted, and the reason shows. The app's own screens are
// put in by the app; features are the admins' own.

interface Edits {
  run: (work: () => Promise<ResourcesFile>) => Promise<string | null>
  index: ChannelIndex
  collapsed: Set<string>
  toggle: (id: string) => void
}

function NodeRow({ node, depth, edits, grip }: {
  node: ResourceNode
  depth: number
  edits: Edits
  grip: ReturnType<ReturnType<typeof useReorder<string>>['grip']>
}) {
  const [name, setName] = useState(node.name)
  const [seen, setSeen] = useState(node.name)
  const [confirming, setConfirming] = useState(false)
  if (seen !== node.name) { setSeen(node.name); setName(node.name) }
  const label = node.name || KIND_LABEL[node.kind]
  const kids = childrenOf(edits.index, node.id)
  const childKind = CHILD_KIND[node.kind]
  const open = !edits.collapsed.has(node.id)

  const commit = () => {
    const next = name.trim()
    if (next === node.name) return
    void edits.run(() => renameResourceNode(node.id, next))
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
    if (e.key === 'Escape') { e.preventDefault(); setName(node.name) }
  }

  return (
    <div className="chRow" style={{ paddingLeft: 4 + depth * 18 }}>
      <button type="button" className="chIconBtn chGrip" aria-label={`Move ${label}`} title="Drag to move (Alt and the up or down arrow)" {...grip}>
        <GripIcon size={13} />
      </button>
      <input
        className="chName" value={name} aria-label={`${KIND_LABEL[node.kind]} name`} placeholder={`Untitled ${KIND_LABEL[node.kind].toLowerCase()}`}
        onChange={e => setName(e.target.value)} onBlur={commit} onKeyDown={onKey}
      />
      <span className="chKind">{KIND_LABEL[node.kind]}</span>
      {confirming ? (
        <span className="chConfirm">
          <button type="button" className="chIconBtn" aria-label={`Delete ${label} and everything under it`} title="Delete" onClick={() => { setConfirming(false); void edits.run(() => deleteResourceNode(node.id)) }}>
            <CheckIcon size={13} />
          </button>
          <button type="button" className="chIconBtn" aria-label="Keep it" title="Keep it" onClick={() => setConfirming(false)}>
            <CloseIcon size={13} />
          </button>
        </span>
      ) : (
        <button type="button" className="chIconBtn" aria-label={`Delete ${label}`} title="Delete" onClick={() => setConfirming(true)}>
          <TrashIcon size={13} />
        </button>
      )}
      {childKind ? (
        <button
          type="button" className="chIconBtn" aria-label={`Add a ${KIND_LABEL[childKind].toLowerCase()} to ${label}`} title={`Add a ${KIND_LABEL[childKind].toLowerCase()}`}
          onClick={() => { if (!open) edits.toggle(node.id); void edits.run(() => addResourceNode(node.id, childKind)) }}
        >
          <PlusIcon size={13} />
        </button>
      ) : <span className="chIconBtn chIconBtn--blank" />}
      {kids.length > 0 ? (
        <button type="button" className="chIconBtn" aria-expanded={open} aria-label={open ? `Hide what is in ${label}` : `Show what is in ${label}`} title={open ? 'Hide' : 'Show'} onClick={() => edits.toggle(node.id)}>
          {open ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}
        </button>
      ) : <span className="chIconBtn chIconBtn--blank" />}
    </div>
  )
}

// The children of one node (or the interfaces), each draggable among its siblings.
function NodeList({ parentId, depth, edits }: { parentId: string | null; depth: number; edits: Edits }) {
  const nodes = childrenOf(edits.index, parentId)
  const order = (ids: string[] | null) => { if (ids) void edits.run(() => reorderResourceNodes(parentId, ids)) }
  const reorder = useReorder<string>(
    (id, before) => order(movedBefore(edits.index, id, before)),
    (id, dir) => order(nudged(edits.index, id, dir)),
  )
  if (nodes.length === 0) return null
  return (
    <div className="chList" ref={reorder.listRef} role="group">
      {nodes.map(node => (
        <div key={node.id} {...reorder.item(node.id)}>
          <NodeRow node={node} depth={depth} edits={edits} grip={reorder.grip(node.id)} />
          {!edits.collapsed.has(node.id) && <NodeList parentId={node.id} depth={depth + 1} edits={edits} />}
        </div>
      ))}
      {reorder.gap && <div className="chGap" style={reorder.gap} aria-hidden="true" />}
    </div>
  )
}

export default function ChannelsConsole() {
  const { index, ready } = useChannels()
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  const run = async (work: () => Promise<ResourcesFile>): Promise<string | null> => {
    setError(null)
    try {
      const file = await work()
      setChannels(file.nodes)
      return null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'That did not work.'
      setError(message)
      return message
    }
  }
  const toggle = (id: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const edits: Edits = { run, index, collapsed, toggle }
  const addInterface = () => { void run(() => addResourceNode(null, 'interface')) }

  return (
    <div className="chConsole">
      <div className="chBar">
        <span className="chTitle">Interface &gt; Console &gt; Component &gt; Feature</span>
        <button type="button" className="chIconBtn" aria-label="Add an interface" title="Add an interface" onClick={() => addInterface()}>
          <PlusIcon size={14} />
        </button>
      </div>
      {error && <p className="chError" role="alert">{error}</p>}
      {!ready ? <p className="chMuted">Loading the channels…</p> : (
        <div className="chTree" role="tree" aria-label="Channels">
          <NodeList parentId={null} depth={0} edits={edits} />
        </div>
      )}
    </div>
  )
}
