import { useEffect, useState } from 'react'
import type { ArcStage, CharacterDoc, CharacterState, LifeEvent } from '../../../../api/types'
import { CHARACTER_MAX_EVENTS, CHARACTER_MAX_STAGES, CHARACTER_MAX_STATES } from '../../../../api/types'
import { PlusIcon, TrashIcon } from '../../../icons'
import { TextField } from './CharFields'
import { appearanceGaps, nextId, stateAt, statesInOrder, type StoryPoint } from './story'

// Names separated by commas, kept as typed (the comma and the space after it are not lost while typing).
function ListField({ label, items, onChange }: { label: string; items: string[]; onChange: (items: string[]) => void }) {
  const parse = (t: string) => t.split(',').map(x => x.trim()).filter((x, j, all) => x && all.indexOf(x) === j).slice(0, 12)
  const [text, setText] = useState(items.join(', '))
  // Another change of the list (an undo) shows in the field; what the field itself produced does not rewrite it.
  useEffect(() => { if (parse(text).join('|') !== items.join('|')) setText(items.join(', ')) }, [items]) // eslint-disable-line react-hooks/exhaustive-deps
  return <TextField label={label} value={text} max={500} onChange={v => { setText(v); onChange(parse(v)) }} />
}

// The story of a character: their arc in stages, what is true of them from point to point of the book (a state carries forward until the next one), how they look at
// those points and what changed between, and a life timeline in story time.
export function StorySection({ doc, edit, points }: { doc: CharacterDoc; edit: (change: (d: CharacterDoc) => CharacterDoc, group?: string) => void; points: StoryPoint[] }) {
  const [at, setAt] = useState('')
  const ordered = statesInOrder(doc.states, points)
  const gaps = appearanceGaps(doc.states, points)
  const here = at ? stateAt(doc.states, points, at) : null
  const pointName = (id: string) => points.find(p => p.id === id)?.label ?? 'A part of the book that is gone'

  const setState = (id: string, patch: Partial<CharacterState>) => edit(d => ({ ...d, states: d.states.map(s => (s.id === id ? { ...s, ...patch } : s)) }), `state.${id}`)
  const setStage = (id: string, patch: Partial<ArcStage>) => edit(d => ({ ...d, arc: d.arc.map(s => (s.id === id ? { ...s, ...patch } : s)) }), `stage.${id}`)
  const setEvent = (id: string, patch: Partial<LifeEvent>) => edit(d => ({ ...d, events: d.events.map(s => (s.id === id ? { ...s, ...patch } : s)) }), `event.${id}`)
  const pointSelect = (label: string, value: string, onChange: (id: string) => void, none = 'Pick a chapter or scene') => (
    <select className="charSelect charSelect--auto" aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{none}</option>
      {points.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  )
  function addState() {
    const free = points.find(p => !doc.states.some(s => s.at === p.id)) ?? points[0]
    edit(d => ({ ...d, states: [...d.states, { id: nextId(d.states, 's'), at: free?.id ?? '', storyTime: '', mood: '', goal: '', where: '', note: '', inventory: [], snapshot: null }] }), 'states')
  }

  return (
    <div className="charSheet">
      <section className="charPanel charWide" aria-label="States">
        <header className="charPanelHead">
          <h3 className="charPanelTitle">Where they are in the story</h3>
          <button type="button" className="charIconBtn" aria-label="Add a state" title="Add a state (from a chapter or scene on)" disabled={doc.states.length >= CHARACTER_MAX_STATES} onClick={addState}><PlusIcon size={16} /></button>
        </header>
        <p className="charHint">A state is what is true of the character from a chapter or scene until the next state: how they feel, what they want, where they are, what they carry and, if you capture it, how they look.</p>
        {points.length === 0 && <p className="charHint">The outline has no chapters or scenes yet.</p>}
        {points.length > 0 && (
          <div className="charRow">
            <span className="charLabel">What is true at</span>
            {pointSelect('Look up the state at', at, setAt, 'Pick a chapter or scene')}
            {at !== '' && <span className="charHint" role="status">{here ? `From ${pointName(here.at)}${here.mood ? `: ${here.mood}` : ''}${here.goal ? `, wants ${here.goal}` : ''}${here.where ? `, at ${here.where}` : ''}` : 'Before their first state.'}</span>}
          </div>
        )}
        <ul className="charList2">
          {ordered.map((s, i) => (
            <li key={s.id} className="charItem charItem--col" aria-label={`State ${i + 1}`}>
              <div className="charRow">
                {pointSelect(`Where state ${s.id} starts`, s.at, v => setState(s.id, { at: v }))}
                <TextField label={`Story time of state ${s.id}`} value={s.storyTime} max={80} onChange={v => setState(s.id, { storyTime: v })} />
                <button type="button" className="charIconBtn" aria-label={`Remove state ${s.id}`} title="Remove this state" onClick={() => edit(d => ({ ...d, states: d.states.filter(x => x.id !== s.id) }), 'states')}><TrashIcon size={16} /></button>
              </div>
              <div className="charRow">
                <TextField label={`Mood in state ${s.id}`} value={s.mood} max={120} onChange={v => setState(s.id, { mood: v })} />
                <TextField label={`Goal in state ${s.id}`} value={s.goal} max={500} onChange={v => setState(s.id, { goal: v })} />
                <TextField label={`Where they are in state ${s.id}`} value={s.where} max={120} onChange={v => setState(s.id, { where: v })} />
              </div>
              <ListField label={`Carrying in state ${s.id} (separate with commas)`} items={s.inventory} onChange={v => setState(s.id, { inventory: v })} />
              <TextField label={`Notes of state ${s.id}`} multiline rows={2} value={s.note} max={2000} onChange={v => setState(s.id, { note: v })} />
              <div className="charRow">
                <button type="button" className="charChip" onClick={() => setState(s.id, { snapshot: structuredClone(doc.look) })}>{s.snapshot ? 'Capture the look again' : 'Capture the look now'}</button>
                {s.snapshot && <button type="button" className="charChip" onClick={() => setState(s.id, { snapshot: null })}>Forget the look</button>}
                {s.snapshot && <span className="charHint">A look is kept for this state.</span>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="charPanel" aria-label="Changes of appearance">
        <h3 className="charPanelTitle">How they look, point to point</h3>
        {gaps.length === 0 ? <p className="charHint">Capture the look in two states to see what changed between them.</p> : (
          <ol className="charGaps">
            {gaps.map(g => (
              <li key={`${g.from.id}-${g.to.id}`}>
                <strong>{pointName(g.from.at)} to {pointName(g.to.at)}</strong>
                {g.changes.length === 0 ? <span className="charHint"> No change.</span> : <ul>{g.changes.map(line => <li key={line}>{line}</li>)}</ul>}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="charPanel" aria-label="Arc">
        <header className="charPanelHead">
          <h3 className="charPanelTitle">Arc</h3>
          <button type="button" className="charIconBtn" aria-label="Add an arc stage" title="Add an arc stage" disabled={doc.arc.length >= CHARACTER_MAX_STAGES} onClick={() => edit(d => ({ ...d, arc: [...d.arc, { id: nextId(d.arc, 'a'), name: '', note: '', at: null }] }), 'arc')}><PlusIcon size={16} /></button>
        </header>
        {doc.arc.length === 0 && <p className="charHint">The stages the character goes through, in order: denial, resistance, change.</p>}
        <ol className="charList2">
          {doc.arc.map((a, i) => (
            <li key={a.id} className="charItem charItem--col">
              <div className="charRow">
                <TextField label={`Name of arc stage ${i + 1}`} value={a.name} max={80} onChange={v => setStage(a.id, { name: v })} />
                {pointSelect(`Where arc stage ${i + 1} begins`, a.at ?? '', v => setStage(a.id, { at: v || null }), 'Not placed yet')}
                <button type="button" className="charIconBtn" aria-label={`Remove arc stage ${i + 1}`} title="Remove this stage" onClick={() => edit(d => ({ ...d, arc: d.arc.filter(x => x.id !== a.id) }), 'arc')}><TrashIcon size={16} /></button>
              </div>
              <TextField label={`About arc stage ${i + 1}`} value={a.note} multiline rows={2} max={1000} onChange={v => setStage(a.id, { note: v })} />
            </li>
          ))}
        </ol>
      </section>
      <section className="charPanel" aria-label="Life timeline">
        <header className="charPanelHead">
          <h3 className="charPanelTitle">Life timeline</h3>
          <button type="button" className="charIconBtn" aria-label="Add a life event" title="Add a life event" disabled={doc.events.length >= CHARACTER_MAX_EVENTS} onClick={() => edit(d => ({ ...d, events: [...d.events, { id: nextId(d.events, 'e'), when: '', title: '', note: '' }] }), 'events')}><PlusIcon size={16} /></button>
        </header>
        {doc.events.length === 0 && <p className="charHint">What happened to the character and when, in story time (a year, an age, a date).</p>}
        <ul className="charList2">
          {doc.events.map((e, i) => (
            <li key={e.id} className="charItem charItem--col">
              <div className="charRow">
                <TextField label={`When life event ${i + 1} happened`} value={e.when} max={80} onChange={v => setEvent(e.id, { when: v })} />
                <TextField label={`What happened in life event ${i + 1}`} value={e.title} max={120} onChange={v => setEvent(e.id, { title: v })} />
                <button type="button" className="charIconBtn" aria-label={`Remove life event ${i + 1}`} title="Remove this event" onClick={() => edit(d => ({ ...d, events: d.events.filter(x => x.id !== e.id) }), 'events')}><TrashIcon size={16} /></button>
              </div>
              <TextField label={`About life event ${i + 1}`} value={e.note} multiline rows={2} max={1000} onChange={v => setEvent(e.id, { note: v })} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
