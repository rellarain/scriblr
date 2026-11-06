import { useEffect, useMemo, useState } from 'react'
import { getCharacter } from '../../../../api/charactersApi'
import type { CharacterDoc, CharacterRelationship, FamilyRole, RelationshipChange, RelationshipKind } from '../../../../api/types'
import { CHARACTER_MAX_CHANGES, CHARACTER_MAX_RELATIONSHIPS } from '../../../../api/types'
import { PlusIcon, TrashIcon } from '../../../icons'
import { TextField } from './CharFields'
import { KIND_NAMES, familyTree, nextId, relationshipAt, webLinks, type StoryPoint } from './story'
import type { Characters } from './useCharacters'

const KINDS = Object.keys(KIND_NAMES) as RelationshipKind[]
const FAMILY: Array<{ id: FamilyRole; name: string }> = [{ id: 'parent', name: 'is their parent' }, { id: 'child', name: 'is their child' }, { id: 'spouse', name: 'is their spouse' }, { id: 'sibling', name: 'is their sibling' }]
// How each kind of link is drawn in the web: the kinds differ by the dash of the line, so the web needs no colour of its own.
const DASH: Record<RelationshipKind, string | undefined> = { family: undefined, friend: '6 3', ally: '2 3', rival: '10 4 2 4', enemy: '1 4', romance: '14 3', mentor: '8 2 2 2', other: '4 4' }

// Every character of the cast as a whole document (the open one is the one being edited), read when the section opens and again when the cast changes.
function useCastDocs(projectId: string, c: Characters): CharacterDoc[] {
  const [docs, setDocs] = useState<Map<string, CharacterDoc>>(new Map())
  const key = c.cast.map(x => `${x.id}@${x.updatedAt}`).join(',')
  useEffect(() => {
    let live = true
    void Promise.all(c.cast.map(x => getCharacter(projectId, x.id).catch(() => null))).then(list => {
      if (live) setDocs(new Map(list.filter((d): d is CharacterDoc => d !== null).map(d => [d.id, d])))
    })
    return () => { live = false }
    // Read again when a character was saved (its summary changes), not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, key])
  return useMemo(() => c.cast.map(x => (x.id === c.doc?.id ? c.doc : docs.get(x.id))).filter((d): d is CharacterDoc => !!d), [c.cast, c.doc, docs])
}

// The relationships of a character: typed links to the others with a description and how they change over the story, who has a link to them, the web of the whole cast
// and the family tree.
export function RelationshipsSection({ projectId, c, doc, points }: { projectId: string; c: Characters; doc: CharacterDoc; points: StoryPoint[] }) {
  const docs = useCastDocs(projectId, c)
  const others = docs.filter(d => d.id !== doc.id)
  const [at, setAt] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  const nameOf = (id: string) => docs.find(d => d.id === id)?.name ?? 'Someone who is gone'

  const edit = c.edit
  const setRel = (id: string, patch: Partial<CharacterRelationship>, group?: string) => edit(d => ({ ...d, relationships: d.relationships.map(r => (r.id === id ? { ...r, ...patch } : r)) }), group ?? `rel.${id}`)
  const setChange = (rel: CharacterRelationship, id: string, patch: Partial<RelationshipChange>) => setRel(rel.id, { changes: rel.changes.map(x => (x.id === id ? { ...x, ...patch } : x)) }, `rel.${rel.id}.${id}`)
  function add() {
    const target = others.find(o => !doc.relationships.some(r => r.targetId === o.id)) ?? others[0]
    if (!target) return
    edit(d => ({ ...d, relationships: [...d.relationships, { id: nextId(d.relationships, 'r'), targetId: target.id, kind: 'friend', family: null, label: '', description: '', changes: [] }] }), 'relationships')
  }
  const incoming = others.flatMap(o => o.relationships.filter(r => r.targetId === doc.id).map(r => ({ from: o, rel: r })))

  return (
    <div className="charSheet">
      <section className="charPanel charWide" aria-label="Relationships">
        <header className="charPanelHead">
          <h3 className="charPanelTitle">Relationships of {doc.name}</h3>
          <button type="button" className="charIconBtn" aria-label="Add a relationship" title="Add a relationship" disabled={others.length === 0 || doc.relationships.length >= CHARACTER_MAX_RELATIONSHIPS} onClick={add}><PlusIcon size={16} /></button>
        </header>
        {others.length === 0 && <p className="charHint">Make another character to link them.</p>}
        {points.length > 0 && doc.relationships.length > 0 && (
          <div className="charRow">
            <span className="charLabel">As it stands at</span>
            <select className="charSelect charSelect--auto" aria-label="Read the relationships as they stand at" value={at} onChange={e => setAt(e.target.value)}>
              <option value="">The start</option>
              {points.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        )}
        <ul className="charList2">
          {doc.relationships.map(r => {
            const now = relationshipAt(r, points, at || null)
            return (
              <li key={r.id} className="charItem charItem--col">
                <div className="charRow">
                  <select className="charSelect charSelect--auto" aria-label={`Who relationship ${r.id} is with`} value={r.targetId} onChange={e => setRel(r.id, { targetId: e.target.value })}>
                    {others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <select className="charSelect charSelect--auto" aria-label={`Kind of relationship with ${nameOf(r.targetId)}`} value={r.kind} onChange={e => setRel(r.id, { kind: e.target.value as RelationshipKind, family: e.target.value === 'family' ? r.family ?? 'sibling' : null })}>
                    {KINDS.map(k => <option key={k} value={k}>{KIND_NAMES[k]}</option>)}
                  </select>
                  {r.kind === 'family' && (
                    <select className="charSelect charSelect--auto" aria-label={`Family link with ${nameOf(r.targetId)}`} value={r.family ?? 'sibling'} onChange={e => setRel(r.id, { family: e.target.value as FamilyRole })}>
                      {FAMILY.map(f => <option key={f.id} value={f.id}>{nameOf(r.targetId)} {f.name}</option>)}
                    </select>
                  )}
                  <button type="button" className="charIconBtn" aria-label={`Remove the relationship with ${nameOf(r.targetId)}`} title="Remove this relationship" onClick={() => edit(d => ({ ...d, relationships: d.relationships.filter(x => x.id !== r.id) }), 'relationships')}><TrashIcon size={16} /></button>
                </div>
                <TextField label={`What ${nameOf(r.targetId)} is to ${doc.name}`} value={r.label} max={60} onChange={v => setRel(r.id, { label: v })} />
                <TextField label={`About the relationship with ${nameOf(r.targetId)}`} value={r.description} multiline rows={2} max={1000} onChange={v => setRel(r.id, { description: v })} />
                {at !== '' && (now.label !== r.label || now.note !== r.description) && <p className="charHint">At this point: {now.label || '(no label)'}{now.note ? ` — ${now.note}` : ''}</p>}
                <button type="button" className="charChip" aria-expanded={shown === r.id} onClick={() => setShown(shown === r.id ? null : r.id)}>Changes over the story ({r.changes.length})</button>
                {shown === r.id && (
                  <div className="charChanges">
                    {r.changes.map((x, i) => (
                      <div key={x.id} className="charRow">
                        <select className="charSelect charSelect--auto" aria-label={`Where change ${i + 1} happens`} value={x.at} onChange={e => setChange(r, x.id, { at: e.target.value })}>
                          <option value="">Pick a chapter or scene</option>
                          {points.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                        <TextField label={`New label of change ${i + 1}`} value={x.label} max={60} onChange={v => setChange(r, x.id, { label: v })} />
                        <TextField label={`Note of change ${i + 1}`} value={x.note} max={500} onChange={v => setChange(r, x.id, { note: v })} />
                        <button type="button" className="charIconBtn" aria-label={`Remove change ${i + 1}`} title="Remove this change" onClick={() => setRel(r.id, { changes: r.changes.filter(y => y.id !== x.id) }, 'changes')}><TrashIcon size={16} /></button>
                      </div>
                    ))}
                    <button type="button" className="charIconBtn" aria-label="Add a change" title="Add a change" disabled={r.changes.length >= CHARACTER_MAX_CHANGES} onClick={() => setRel(r.id, { changes: [...r.changes, { id: nextId(r.changes, 'c'), at: '', label: '', note: '' }] }, 'changes')}><PlusIcon size={16} /></button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
      <section className="charPanel" aria-label="Who is linked to them">
        <h3 className="charPanelTitle">Who has a link to {doc.name}</h3>
        {incoming.length === 0 && <p className="charHint">Nobody has a relationship with this character yet.</p>}
        <ul className="charList2">
          {incoming.map(({ from, rel }) => (
            <li key={`${from.id}-${rel.id}`} className="charIncoming">
              <button type="button" className="charLink" onClick={() => { void c.open(from.id) }}>{from.name}</button>
              <span>{KIND_NAMES[rel.kind]}{rel.label ? `: ${rel.label}` : ''}</span>
            </li>
          ))}
        </ul>
      </section>
      <Web docs={docs} openId={doc.id} onOpen={id => { void c.open(id) }} />
      <Tree docs={docs} rootId={doc.id} onOpen={id => { void c.open(id) }} />
    </div>
  )
}

// The web: the whole cast in a ring, a line for each relationship (a kind has its own dash), the open character marked.
function Web({ docs, openId, onOpen }: { docs: CharacterDoc[]; openId: string; onOpen: (id: string) => void }) {
  const links = useMemo(() => webLinks(docs), [docs])
  const R = 130
  const pos = new Map(docs.map((d, i) => [d.id, [160 + R * Math.sin((2 * Math.PI * i) / Math.max(1, docs.length)), 160 - R * Math.cos((2 * Math.PI * i) / Math.max(1, docs.length))] as const]))
  return (
    <section className="charPanel charWeb" aria-label="Web of relationships">
      <h3 className="charPanelTitle">Web of the cast</h3>
      {links.length === 0 ? <p className="charHint">No relationships yet.</p> : (
        <svg viewBox="0 0 320 320" className="charWebSvg" role="img" aria-label={`Web of relationships: ${links.map(l => `${docs.find(d => d.id === l.from)?.name} and ${docs.find(d => d.id === l.to)?.name}, ${KIND_NAMES[l.kind]}`).join('; ')}`}>
          {links.map((l, i) => {
            const a = pos.get(l.from), b = pos.get(l.to)
            return a && b ? <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--ink)" strokeWidth={1.6} strokeDasharray={DASH[l.kind]} opacity={0.7} /> : null
          })}
          {docs.map(d => {
            const p = pos.get(d.id)!
            return (
              <g key={d.id} className="charWebNode" onClick={() => onOpen(d.id)} tabIndex={0} role="button" aria-label={`Open ${d.name}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen(d.id) }}>
                <circle cx={p[0]} cy={p[1]} r={d.id === openId ? 16 : 12} fill="var(--surface-raised)" stroke="var(--ink)" strokeWidth={d.id === openId ? 3 : 1.5} />
                <text x={p[0]} y={p[1] + 28} textAnchor="middle" fontSize={11} fill="var(--ink)">{d.name}</text>
              </g>
            )
          })}
        </svg>
      )}
      <ul className="charKey" aria-label="Kinds of link">{KINDS.filter(k => links.some(l => l.kind === k)).map(k => <li key={k}><svg width="30" height="8" aria-hidden="true"><line x1="0" y1="4" x2="30" y2="4" stroke="var(--ink)" strokeWidth={1.6} strokeDasharray={DASH[k]} /></svg>{KIND_NAMES[k]}</li>)}</ul>
    </section>
  )
}

// The family tree of the open character: grandparents above, children below, spouses side by side.
function Tree({ docs, rootId, onOpen }: { docs: CharacterDoc[]; rootId: string; onOpen: (id: string) => void }) {
  const rows = useMemo(() => familyTree(docs, rootId), [docs, rootId])
  const GEN = (g: number) => (g === 0 ? 'Their generation' : g < 0 ? (g === -1 ? 'Parents' : g === -2 ? 'Grandparents' : 'Earlier') : (g === 1 ? 'Children' : g === 2 ? 'Grandchildren' : 'Later'))
  return (
    <section className="charPanel" aria-label="Family tree">
      <h3 className="charPanelTitle">Family tree</h3>
      {rows.length <= 1 && rows[0]?.people.length <= 1 ? <p className="charHint">Give a relationship the kind Family to build a tree: parents, children, spouses and siblings.</p> : (
        <div className="charTree">
          {rows.map(row => (
            <div key={row.generation} className="charTreeRow" role="group" aria-label={GEN(row.generation)}>
              <span className="charLabel">{GEN(row.generation)}</span>
              <ul className="charTreePeople">
                {row.people.filter(p => !p.partner || p.id < p.partner).map(p => (
                  <li key={p.id} className="charTreeUnit">
                    <button type="button" className="charChip" aria-pressed={p.id === rootId} onClick={() => onOpen(p.id)}>{p.name}</button>
                    {p.partner && <><span aria-hidden="true">+</span><button type="button" className="charChip" aria-pressed={p.partner === rootId} onClick={() => onOpen(p.partner!)}>{docs.find(d => d.id === p.partner)?.name}</button></>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
