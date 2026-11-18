import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { PlotNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { LinkIcon, PlusIcon } from '../../icons'
import { plotColors, plotColorVars } from './plotColors'
import { linkChoices, linksOf, type LinkKind } from './plotLinks'
import { nodeLabel, plotTrail } from './plotTree'

// The Keywords field of a category, subcategory, cluster or plotline editor, and of a parent chip's editor (the user, 2026-11-18): one row of chips,
// its keywords and then its links (to other categories, subcategories, clusters and plotlines), ending in one box. What is typed there is a keyword,
// unless it starts with @: then it searches for a node to link, the matches listed under the row with their kind and place (Enter links the first,
// arrows choose). A keyword's text is edited by clicking it (Enter or leaving keeps it, Escape puts it back; edited into one the node already has,
// the two become one; @ there turns it into a link). A link chip wears the linked node's colour, opens it, and asks before it is taken away (from both
// ends). The box grows with what is typed and takes a line of its own when it no longer fits beside the chips.

const MAX_SUGGESTIONS = 12

export interface LinkSuggestion { id: string; kind: LinkKind; title: string; path: string }

// What `node` can be linked to whose title or place holds `query`, titles that start with it first; at most twelve.
export function linkSuggestions(node: PlotNode, nodes: PlotNode[], byId: Map<string, PlotNode>, query: string): LinkSuggestion[] {
  const q = query.trim().toLowerCase()
  const all = linkChoices(node, nodes).flatMap(group => group.items.flatMap(item => {
    const n = byId.get(item.id)
    return n ? [{ id: n.id, kind: group.kind, title: nodeLabel(n), path: plotTrail(n, byId).map(nodeLabel).join(' › ') }] : []
  }))
  const rank = (s: LinkSuggestion) => {
    const title = s.title.toLowerCase()
    return title.startsWith(q) ? 0 : title.includes(q) ? 1 : s.path.toLowerCase().includes(q) ? 2 : 3
  }
  return all.map((s, i) => ({ s, i, r: rank(s) })).filter(x => x.r < 3).sort((a, b) => a.r - b.r || a.i - b.i).slice(0, MAX_SUGGESTIONS).map(x => x.s)
}

// A box that grows with its text: a hidden copy of the text (or the placeholder) sizes it (the input's own width is one character: size 1).
function GrowBox({ value, placeholder, children }: { value: string; placeholder: string; children: ReactNode }) {
  return <span className="wrChipBox" data-value={value || placeholder}>{children}</span>
}

// A link of a node as a chip, in the linked node's colour (its title opens it; its full place is the title's tooltip).
export function PlotLinkChip({ byId, projectHue, other, small, onOpen, children }: {
  byId: Map<string, PlotNode>
  projectHue?: number
  other: PlotNode
  small?: boolean
  onOpen: (id: string) => void
  // What follows the title (the field's remove button).
  children?: ReactNode
}) {
  const label = nodeLabel(other)
  const path = [...plotTrail(other, byId), other].map(nodeLabel).join(' › ')
  return (
    <span className={`wrLinkChip wrLinkChip--${other.kind}${small ? ' wrLinkChip--small' : ''}`} style={plotColorVars(plotColors(other, byId, projectHue))} data-link={other.id}>
      <LinkIcon size={small ? 10 : 12} />
      <button type="button" className="wrLinkChipOpen" aria-label={`Open ${label}`} title={path} onClick={() => onOpen(other.id)}>{label}</button>
      {children}
    </span>
  )
}

// The links of a node as small read-only chips (the plot tree, an expanded parent chip, a child row).
export function PlotLinkChips({ node, byId, projectHue, label, onOpen }: {
  node: PlotNode
  byId: Map<string, PlotNode>
  projectHue?: number
  label: string
  onOpen: (id: string) => void
}) {
  const linked = linksOf(node).flatMap(id => byId.get(id) ?? [])
  if (linked.length === 0) return null
  return (
    <span className="wrLinkChips" role="list" aria-label={`Links of ${label}`}>
      {linked.map(other => <span key={other.id} role="listitem"><PlotLinkChip byId={byId} projectHue={projectHue} other={other} small onOpen={onOpen} /></span>)}
    </span>
  )
}

export function PlotChipField({ w, node, label = 'Keywords' }: { w: WriterWorkspace; node: PlotNode; label?: string }) {
  const listId = useId()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ keyword: string; text: string } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const name = nodeLabel(node)
  const linked = linksOf(node).flatMap(id => w.plotNodeById.get(id) ?? [])

  // The box being typed in (a keyword being edited, else the add box) searches for a link while its text starts with @.
  const typed = editing ? editing.text : draft
  const searching = typed.trimStart().startsWith('@') && !dismissed
  const suggestions = searching ? linkSuggestions(node, w.plotNodes, w.plotNodeById, typed.trimStart().slice(1)) : []
  const at = Math.min(active, Math.max(0, suggestions.length - 1))

  const type = (text: string, set: (t: string) => void) => { set(text); setActive(0); setDismissed(false) }
  const link = (id: string) => {
    if (editing) { w.keywordToLink(node.id, editing.keyword, id); setEditing(null) } else { w.addPlotLink(node.id, id); setDraft('') }
    setActive(0)
  }
  const addDraft = () => {
    if (draft.trimStart().startsWith('@')) { if (suggestions[at]) link(suggestions[at].id); return }
    if (!draft.trim()) return
    w.addPlotKeyword(node.id, draft)
    setDraft('')
  }
  const saveEdit = () => {
    if (!editing) return
    // An edit that is empty, or still a search for a link, keeps the keyword as it was.
    if (editing.text.trim() && !editing.text.trimStart().startsWith('@')) w.renamePlotKeyword(node.id, editing.keyword, editing.text)
    setEditing(null)
    setDismissed(false)
  }
  const keys = (e: KeyboardEvent<HTMLInputElement>, onEnter: () => void, onEscape: () => void) => {
    if (searching && suggestions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setActive((at + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (searching) { if (suggestions[at]) link(suggestions[at].id) } else onEnter()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (searching) setDismissed(true)
      else onEscape()
    }
  }
  const combo = (expanded: boolean) => ({
    role: 'combobox' as const,
    'aria-expanded': expanded,
    'aria-controls': expanded ? listId : undefined,
    'aria-autocomplete': 'list' as const,
    'aria-activedescendant': expanded && suggestions.length > 0 ? `${listId}-${at}` : undefined,
  })

  const other = confirming ? w.plotNodeById.get(confirming) : undefined
  return (
    <div className="wrChipField">
      <div className="wrLabel">{label}</div>
      <div className="wrChipRow">
        {node.keywords.map(k => (editing?.keyword === k ? (
          <span key={k} className="wrChip wrChip--editing">
            <GrowBox value={editing.text} placeholder={k}>
              <input
                autoFocus size={1} value={editing.text} aria-label={`Keyword ${k}`} data-kf="" {...combo(searching)}
                onChange={e => type(e.target.value, text => setEditing({ keyword: k, text }))}
                onKeyDown={e => keys(e, saveEdit, () => { setEditing(null); setDismissed(false) })}
                onBlur={saveEdit}
              />
            </GrowBox>
          </span>
        ) : (
          <span key={k} className="wrChip">
            <button type="button" className="wrChipText" aria-label={`Edit keyword ${k}`} title="Edit" onClick={() => { setEditing({ keyword: k, text: k }); setActive(0); setDismissed(false) }}>{k}</button>
            <button type="button" aria-label={`Remove ${k}`} title={`Remove ${k}`} onClick={() => w.removePlotKeyword(node.id, k)}>×</button>
          </span>
        )))}
        {linked.map(o => (
          <PlotLinkChip key={o.id} byId={w.plotNodeById} projectHue={w.projectHue} other={o} onOpen={w.focusPlotNode}>
            <button type="button" className="wrLinkChipRemove" aria-label={`Remove the link to ${nodeLabel(o)}`} title={`Remove the link to ${nodeLabel(o)}`} onClick={() => setConfirming(o.id)}>×</button>
          </PlotLinkChip>
        ))}
        <span className="wrChipAdd">
          <GrowBox value={draft} placeholder="Add keyword or @link…">
            <input
              size={1} value={draft} placeholder="Add keyword or @link…" aria-label={`Add a keyword or a link to ${name}`} data-kf="" {...combo(searching && !editing)}
              onChange={e => type(e.target.value, setDraft)}
              onKeyDown={e => keys(e, addDraft, () => setDraft(''))}
            />
          </GrowBox>
          <button
            type="button" aria-label={draft.trimStart().startsWith('@') ? 'Link the first match' : 'Add keyword'} title={draft.trimStart().startsWith('@') ? 'Link the first match' : 'Add keyword'}
            disabled={draft.trimStart().startsWith('@') ? suggestions.length === 0 || !!editing : !draft.trim()} onClick={addDraft}
          ><PlusIcon size={12} /></button>
        </span>
      </div>
      {searching && (
        <ul className="wrLinkPicker" id={listId} role="listbox" aria-label={`Link ${name} to`}>
          {suggestions.length === 0 && <li className="wrLinkPickerNone" role="option" aria-selected={false} aria-disabled="true">Nothing by that name.</li>}
          {suggestions.map((s, k) => (
            <li
              key={s.id} id={`${listId}-${k}`} role="option" aria-selected={k === at} className={k === at ? 'wrLinkPickerOption wrLinkPickerOption--on' : 'wrLinkPickerOption'}
              onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(k)} onClick={() => link(s.id)}
            >
              <span className="wrLinkPickerTitle">{s.title}</span>
              <span className="wrLinkPickerKind">{s.kind}</span>
              {s.path && <span className="wrLinkPickerPath">{s.path}</span>}
            </li>
          ))}
        </ul>
      )}
      {other && (
        <span className="wrConfirm wrConfirm--dark" role="group" aria-label={`Remove the link to ${nodeLabel(other)}?`}>
          <span className="wrConfirmText">Remove the link to {nodeLabel(other)}? It also leaves {nodeLabel(other)}&apos;s links.</span>
          <button type="button" className="wrSmallBtn wrSmallBtn--accent" onClick={() => { setConfirming(null); w.removePlotLink(node.id, other.id) }}>Confirm</button>
          <button type="button" className="wrSmallBtn" onClick={() => setConfirming(null)}>Cancel</button>
        </span>
      )}
    </div>
  )
}
