import { useChannels } from '../channels/channelStore'
import { CHILD_KIND, KIND_LABEL, childrenOf, pathOf } from '../channels/channelTree'

// The subject of a statement: a node of the channel list (an interface, console, component or feature), picked from where it
// is now. The path so far is a row of buttons (pressing one goes back up to it); the select under it narrows to a node one
// level down. The value is always a node id.
export function ChannelPicker({ value, onChange, label, disabled = false }: {
  value: string | null
  onChange: (id: string) => void
  label: string
  disabled?: boolean
}) {
  const { index } = useChannels()
  const path = pathOf(index, value)
  const at = path[path.length - 1] ?? null
  const options = childrenOf(index, at ? at.id : null)
  const nextKind = at ? CHILD_KIND[at.kind] : 'interface'

  return (
    <div className="fbPicker" role="group" aria-label={label}>
      {path.length > 0 && (
        <div className="fbCrumbs">
          {path.map((node, i) => (
            <button
              key={node.id} type="button" className="fbCrumb" data-cf disabled={disabled || i === path.length - 1}
              aria-current={i === path.length - 1 ? 'location' : undefined} title={i === path.length - 1 ? undefined : `Back to ${node.name}`}
              onClick={() => onChange(node.id)}
            >
              {node.name || KIND_LABEL[node.kind]}
            </button>
          ))}
        </div>
      )}
      {options.length > 0 && nextKind && (
        <select
          className="fbSelect" data-cf value="" disabled={disabled} aria-label={`Narrow to a ${KIND_LABEL[nextKind].toLowerCase()}`}
          onChange={e => { if (e.target.value) onChange(e.target.value) }}
        >
          <option value="">{at ? `Narrow to a ${KIND_LABEL[nextKind].toLowerCase()}…` : 'Choose an interface…'}</option>
          {options.map(n => <option key={n.id} value={n.id}>{n.name || KIND_LABEL[n.kind]}</option>)}
        </select>
      )}
    </div>
  )
}

export default ChannelPicker
