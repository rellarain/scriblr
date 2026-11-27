import { useState } from 'react'
import { FLAG_KINDS, type FlagType } from '../../../../api/types'
import {
  currentPass, goalProgress, goalTitle, kindLabel, passesInOrder, passSummary, type PassFacts, type PassGoal, type PassGoalKind, type RevisionPass,
} from '../../../../lib/revisionPasses'
import type { Planner } from '../../../../lib/facets'
import { PlusIcon, TrashIcon } from '../../../icons'
import { DeleteControl } from '../shared'
import { IconBtn } from './IconBtn'
import { newId } from './ids'

// The project's revision passes (the Schedule console's Revision passes tile): a card for each pass in the order they come (its name, its
// dates and how many of its flags are resolved, with a bar), and the chosen pass open under them to edit: its name and dates, what it covers
// (the whole project), the kinds of flag it works through, and its goals with how far each has come. Its open flags are tasks in the Backlog,
// due on its last day. The passes are kept in the project's planner.

const GOAL_KINDS: Array<{ kind: PassGoalKind; label: string }> = [
  { kind: 'flags', label: 'Resolve flags of its kinds' },
  { kind: 'words', label: 'Change the word count' },
  { kind: 'read', label: 'Read chapters' },
]

export function newPass(today: string, number: number): RevisionPass {
  return { id: newId('pass'), name: `Pass ${number}`, start: today, end: null, kinds: [], goals: [{ id: newId('pg'), kind: 'flags', words: null }] }
}

function Bar({ done, target, label }: { done: number; target: number; label: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0
  return (
    <div className="wrBarTrack" role="img" aria-label={`${label}: ${pct} percent`}>
      <div className="wrBarFill" style={{ width: `${pct}%`, background: 'var(--wr-f-revision)' }} />
    </div>
  )
}

function GoalAdder({ onAdd }: { onAdd: (goal: PassGoal) => void }) {
  const [kind, setKind] = useState<PassGoalKind>('flags')
  const [direction, setDirection] = useState<'cut' | 'add'>('cut')
  const [amount, setAmount] = useState('')
  const n = Number.parseInt(amount, 10)
  const ready = kind !== 'words' || (Number.isFinite(n) && n > 0)
  return (
    <div className="wrPassAdd">
      <select className="wrField" aria-label="Kind of goal" value={kind} onChange={e => setKind(e.target.value as PassGoalKind)}>
        {GOAL_KINDS.map(g => <option key={g.kind} value={g.kind}>{g.label}</option>)}
      </select>
      {kind === 'words' && (
        <>
          <select className="wrField" aria-label="Cut or add" value={direction} onChange={e => setDirection(e.target.value as 'cut' | 'add')}>
            <option value="cut">Cut</option>
            <option value="add">Add</option>
          </select>
          <input className="wrField wrSchedNum" type="number" min={1} aria-label="Words" placeholder="words" value={amount} onChange={e => setAmount(e.target.value)} />
        </>
      )}
      <button
        type="button" className="wrSmallBtn" disabled={!ready}
        onClick={() => { onAdd({ id: newId('pg'), kind, words: kind === 'words' ? (direction === 'cut' ? -n : n) : null }); setAmount('') }}
      >Add a goal</button>
    </div>
  )
}

export function PassesCard({ planner, onPlanner, facts, projectTitle, bookCount }: {
  planner: Planner
  onPlanner: (next: Planner) => void
  facts: PassFacts
  projectTitle: string
  bookCount: number
}) {
  const passes = passesInOrder(planner.passes ?? [])
  const [chosenId, setChosenId] = useState<string | null>(null)
  const chosen = passes.find(p => p.id === chosenId) ?? currentPass(passes, facts.today)
  const save = (next: RevisionPass[]) => onPlanner({ ...planner, passes: next })
  const update = (patch: Partial<RevisionPass>) => { if (chosen) save(passes.map(p => (p.id === chosen.id ? { ...p, ...patch } : p))) }
  const add = () => {
    const pass = newPass(facts.today, passes.length + 1)
    save([...passes, pass])
    setChosenId(pass.id)
  }
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  return (
    <div className="wrSchedCard wrPasses">
      <div className="wrSchedHead">
        <span className="wrSchedSpacer" />
        <IconBtn Icon={PlusIcon} label="New pass" className="wrSmallBtn wrSmallBtn--accent" onClick={add} />
      </div>
      {passes.length === 0 && <p className="wrMuted">No revision passes yet. A pass works through some kinds of flag across the whole project, with goals of its own.</p>}
      {passes.length > 0 && (
        <div className="wrPassCards" role="list" aria-label="Revision passes">
          {passes.map((p, i) => {
            const flags = goalProgress({ id: '', kind: 'flags', words: null }, p, facts)
            return (
              <button
                key={p.id} type="button" role="listitem" aria-current={chosen?.id === p.id} className={chosen?.id === p.id ? 'wrPassCard wrPassCard--chosen' : 'wrPassCard'}
                onClick={() => setChosenId(p.id)}
              >
                <span className="wrPassCardName">Pass {i + 1} · {p.name || 'Untitled'}</span>
                <span className="wrPassCardLine">{passSummary(p, facts.flags, facts.today)}</span>
                <Bar done={flags.done} target={flags.target} label={`Pass ${i + 1} flags`} />
              </button>
            )
          })}
        </div>
      )}
      {chosen && (
        <section className="wrPassEdit" aria-label={`Pass ${passes.indexOf(chosen) + 1}`}>
          <div className="wrPassFields">
            <label className="wrKv"><span>Name</span><input className="wrField" aria-label="Pass name" maxLength={100} value={chosen.name} onChange={e => update({ name: e.target.value })} /></label>
            <label className="wrKv"><span>From</span><input className="wrField" type="date" aria-label="From" value={chosen.start} onChange={e => { if (e.target.value) update({ start: e.target.value, end: chosen.end && chosen.end < e.target.value ? e.target.value : chosen.end }) }} /></label>
            <label className="wrKv"><span>To (optional)</span><input className="wrField" type="date" aria-label="To" min={chosen.start} value={chosen.end ?? ''} onChange={e => update({ end: e.target.value || null })} /></label>
          </div>
          <div className="wrPassBlock">
            <span className="wrLabel">Covers</span>
            <span>Every book and chapter of {projectTitle || 'the project'}: {plural(bookCount, 'book')}, {plural(facts.chapterIds.length, 'chapter')}.</span>
          </div>
          <div className="wrPassBlock">
            <span className="wrLabel">Works through the flags</span>
            <div className="wrChoice" role="group" aria-label="Kinds of flag in this pass">
              {FLAG_KINDS.map((k: FlagType) => {
                const on = chosen.kinds.includes(k)
                return (
                  <button key={k} type="button" aria-pressed={on} className={on ? 'on' : undefined}
                    onClick={() => update({ kinds: on ? chosen.kinds.filter(x => x !== k) : FLAG_KINDS.filter(x => x === k || chosen.kinds.includes(x)) })}
                  >{kindLabel(k)}</button>
                )
              })}
            </div>
          </div>
          <div className="wrPassBlock">
            <span className="wrLabel">Goals of this pass</span>
            {chosen.goals.length === 0 && <span className="wrMuted">No goals yet.</span>}
            {chosen.goals.length > 0 && (
              <ul className="wrPassGoals" aria-label="Goals of this pass">
                {chosen.goals.map(g => {
                  const progress = goalProgress(g, chosen, facts)
                  const title = goalTitle(g, chosen)
                  return (
                    <li key={g.id} className="wrPassGoal">
                      <span className="wrPassGoalTitle">{title}</span>
                      <span className="wrPassGoalCount">{progress.text}</span>
                      <Bar done={progress.done} target={progress.target} label={title} />
                      <IconBtn Icon={TrashIcon} label={`Remove the goal: ${title}`} className="wrTrashBtn wrTrashBtn--dark" onClick={() => update({ goals: chosen.goals.filter(x => x.id !== g.id) })} />
                    </li>
                  )
                })}
              </ul>
            )}
            {chosen.goals.length < 12 && <GoalAdder onAdd={goal => update({ goals: [...chosen.goals, goal] })} />}
          </div>
          <div className="wrPassFoot">
            <span className="wrMuted">Its open flags are tasks in the Backlog{chosen.end ? ', due on its last day' : ''}.</span>
            <DeleteControl tone="dark" message={`Delete ${chosen.name || 'this pass'}? Its flags stay.`} onConfirm={() => { save(passes.filter(p => p.id !== chosen.id)); setChosenId(null) }} />
          </div>
        </section>
      )}
    </div>
  )
}

export default PassesCard
