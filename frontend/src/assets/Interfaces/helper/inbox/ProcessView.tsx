import { useMemo, useState } from 'react'
import {
  CheckIcon, ChevronDownIcon, ChevronRightIcon, CloseIcon, ListIcon, LockIcon, PlusIcon, QuestionIcon, UnlockIcon, VotingIcon,
} from '../../../icons'
import type { FeedbackChannel, FeedbackSolution, FeedbackVote, InboxBundle, StatementCase, ToneCategory, VoteInput } from './feedbackTypes'
import {
  CATEGORY_LABEL, TONE_CATEGORIES, channelAncestors, channelLabel, filterCases, needsMyVote, needsMyVoteCount, sortCases, statusLabel, tally,
  type CaseSort, type CaseView,
} from './inboxLogic'
import { ToneBar, ToneSwatch } from './ValidationControls'
import { VoteControl } from './VoteControl'

// Processing: the feedback statement cases (one intention verb + one subject, with the messages behind
// them). Admins vote yes / no / pass on the statement with optional notes; Configurers propose solutions, which
// are voted on the same way; a Planner closes a case as approved or rejected. Cards are collapsed to the essentials
// (verb, subject, tone, votes, validators); messages, solutions and history open on demand. Nobody is named.

export interface ProcessActions {
  voteCase: (caseId: string, vote: VoteInput) => void
  voteSolution: (caseId: string, solutionId: string, vote: VoteInput) => void
  propose: (caseId: string, solution: { title: string; description: string; target: FeedbackChannel }) => Promise<boolean>
  close: (caseId: string, outcome: 'approved' | 'rejected', note: string) => Promise<boolean>
  reopen: (caseId: string) => void
}

const dateOf = (iso: string) => {
  // A plain date (a message's) is a calendar day, not a moment in UTC: read it in local time.
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// The history reads "yes", "no" and "pass" (the server logs approved / denied / passed).
const voteWords = (detail: string) => detail.replace(/approved/g, 'yes').replace(/denied/g, 'no').replace(/passed/g, 'pass')
const HISTORY_TEXT: Record<string, (detail: string, mine: boolean) => string> = {
  vote: (d, mine) => `${mine ? 'You' : 'Someone'} voted ${voteWords(d)}`,
  'solution-vote': (d, mine) => `${mine ? 'You' : 'Someone'} voted ${voteWords(d)}`,
  solution: (d, mine) => `${mine ? 'You' : 'Someone'} ${d}`,
  closed: (d, mine) => `${mine ? 'You' : 'A Planner'} closed the case as ${d}`,
  reopened: (_d, mine) => `${mine ? 'You' : 'A Configurer'} reopened the case`,
}

// Yes, no and pass counts as three small coloured squares.
function Tally({ votes }: { votes: FeedbackVote[] }) {
  const t = tally(votes)
  return (
    <span className="tally" aria-label={`${t.approve} yes, ${t.deny} no, ${t.passed} pass`}>
      <span className="tallyItem tallyItem--approve" title="Yes"><CheckIcon size={11} />{t.approve}</span>
      <span className="tallyItem tallyItem--deny" title="No"><CloseIcon size={11} />{t.deny}</span>
      <span className="tallyItem tallyItem--pass" title="Pass"><QuestionIcon size={11} />{t.passed}</span>
    </span>
  )
}

// What the other admins voted, with their notes (nobody is named).
function VoteList({ votes }: { votes: FeedbackVote[] }) {
  const others = votes.filter(v => !v.mine)
  if (others.length === 0) return null
  return (
    <ul className="voteLog">
      {others.map((v, i) => (
        <li key={i}>
          {v.approve && <span className="voteMark voteMark--approve" title="Yes"><CheckIcon size={12} /></span>}
          {v.deny && <span className="voteMark voteMark--deny" title="No"><CloseIcon size={12} /></span>}
          {v.passed && <span className="voteMark voteMark--pass" title="Pass"><QuestionIcon size={12} /></span>}
          <span className="voteLogNotes">
            {v.approve && v.approveNote && <span>{v.approveNote}</span>}
            {v.deny && v.denyNote && <span>{v.denyNote}</span>}
            {v.passed && v.passNote && <span>{v.passNote}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function SolutionCard({ solution, c, disabled, reason, actions }: {
  solution: FeedbackSolution; c: StatementCase; disabled: boolean; reason: string; actions: ProcessActions
}) {
  return (
    <div className="solutionCard">
      <div className="solutionHead">
        <span className="solutionTitle">{solution.title}</span>
        {solution.mine && <span className="mineTag">yours</span>}
        <Tally votes={solution.votes} />
      </div>
      <div className="subjectAncestors">{channelLabel(solution.target)} · {dateOf(solution.createdAt)}</div>
      {solution.description && <p className="solutionText">{solution.description}</p>}
      <VoteControl
        vote={solution.votes.find(v => v.mine)} label={`the solution ${solution.title}`}
        disabled={disabled} disabledReason={reason}
        onChange={vote => actions.voteSolution(c.id, solution.id, vote)}
      />
      <VoteList votes={solution.votes} />
    </div>
  )
}

function ProposeForm({ c, bundle, onDone, actions }: { c: StatementCase; bundle: InboxBundle; onDone: () => void; actions: ProcessActions }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [page, setPage] = useState(c.channel.page)
  const [consoleName, setConsole] = useState(c.channel.console)
  const [component, setComponent] = useState(c.channel.component)
  const [error, setError] = useState('')
  const pageDef = bundle.taxonomy.find(p => p.name === page)
  const consoleDef = pageDef?.consoles.find(x => x.name === consoleName)

  async function submit() {
    if (!title.trim()) { setError('Give the solution a title.'); return }
    if (!page || !consoleName || !component) { setError('Choose where the change belongs.'); return }
    const ok = await actions.propose(c.id, { title, description, target: { page, console: consoleName, component, feature: '' } })
    if (ok) onDone()
  }

  return (
    <div className="proposeForm">
      <input
        aria-label="Solution title" placeholder="Solution title" maxLength={120} value={title}
        onChange={e => { setTitle(e.target.value); setError('') }}
      />
      <textarea
        aria-label="Solution description" placeholder="What should change? (optional)" rows={3} maxLength={2000} value={description}
        onChange={e => setDescription(e.target.value)}
      />
      <div className="targetRow">
        <select aria-label="Target page" value={page} onChange={e => { setPage(e.target.value); setConsole(''); setComponent('') }}>
          {bundle.taxonomy.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <select aria-label="Target console" value={consoleName} onChange={e => { setConsole(e.target.value); setComponent('') }}>
          <option value="">Console…</option>
          {pageDef?.consoles.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}
        </select>
        <select aria-label="Target component" value={component} onChange={e => setComponent(e.target.value)}>
          <option value="">Component…</option>
          {consoleDef?.components.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}
        </select>
      </div>
      {error && <p className="inboxError" role="alert">{error}</p>}
      <div className="toneRow">
        <button type="button" className="iconBtn iconBtn--yes" aria-label="Propose" title="Propose" onClick={() => void submit()}><CheckIcon size={16} /></button>
        <button type="button" className="iconBtn" aria-label="Cancel" title="Cancel" onClick={onDone}><CloseIcon size={16} /></button>
      </div>
    </div>
  )
}

function CloseForm({ c, onDone, actions }: { c: StatementCase; onDone: () => void; actions: ProcessActions }) {
  const [note, setNote] = useState('')
  const finish = async (outcome: 'approved' | 'rejected') => { if (await actions.close(c.id, outcome, note)) onDone() }
  return (
    <div className="proposeForm">
      <input aria-label="Closing note" placeholder="Closing note (optional)" maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
      <div className="toneRow">
        <button type="button" className="iconBtn iconBtn--yes" aria-label="Close as approved" title="Close as approved" onClick={() => void finish('approved')}><CheckIcon size={16} /></button>
        <button type="button" className="iconBtn iconBtn--no" aria-label="Close as rejected" title="Close as rejected" onClick={() => void finish('rejected')}><CloseIcon size={16} /></button>
        <button type="button" className="iconBtn" aria-label="Cancel" title="Cancel" onClick={onDone}>×</button>
      </div>
    </div>
  )
}

function CaseCard({ c, bundle, expanded, onToggle, actions }: {
  c: StatementCase; bundle: InboxBundle; expanded: boolean; onToggle: () => void; actions: ProcessActions
}) {
  const [proposing, setProposing] = useState(false)
  const [closing, setClosing] = useState(false)
  const closed = c.status !== 'open'
  const where = `${c.channel.page} > ${c.channel.console}`
  const voteReason = closed ? 'This case is closed.' : `Voting needs the Processor role on ${where}.`
  const needs = needsMyVote(c)

  return (
    <article className={`caseCard caseCard--${c.status}`} aria-label={`${c.verbName}: ${channelLabel(c.channel)}`}>
      <button type="button" className="caseHead" aria-expanded={expanded} onClick={onToggle}>
        {expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        <span className="caseHeadMain">
          <span className="caseVerb">{c.verbName}</span>
          <span className="caseChannel">{channelAncestors(c.channel).join(' / ')}</span>
          <span className="caseFeature">{c.channel.feature}</span>
        </span>
        {closed && <span className={`statusIcon statusIcon--${c.status}`} title={statusLabel(c)}>{c.status === 'approved' ? <CheckIcon size={12} /> : <CloseIcon size={12} />}</span>}
        <span className="caseCounts">
          <ToneSwatch category={c.tone.category} />
          <Tally votes={c.votes} />
          <span className="validatorCount" title={`${c.validators} validator${c.validators === 1 ? '' : 's'}`}>{c.validators}</span>
          <span className="messageCount" title={`${c.messages.length} message${c.messages.length === 1 ? '' : 's'}`}>{c.messages.length}</span>
        </span>
        {needs && <span className="needsDot" title="Needs your vote" aria-label="Needs your vote" />}
      </button>
      {expanded && (
        <div className="caseBody">
          <ToneBar summary={c.tone} />

          <section aria-label="Your vote on the statement">
            <VoteControl
              vote={c.votes.find(v => v.mine)} label="this statement"
              disabled={closed || !c.can.vote} disabledReason={voteReason}
              onChange={vote => actions.voteCase(c.id, vote)}
            />
            <VoteList votes={c.votes} />
          </section>

          <section aria-label="Solutions">
            {c.solutions.map(s => (
              <SolutionCard key={s.id} solution={s} c={c} disabled={closed || !c.can.vote} reason={voteReason} actions={actions} />
            ))}
            {proposing
              ? <ProposeForm c={c} bundle={bundle} onDone={() => setProposing(false)} actions={actions} />
              : (
                <button
                  type="button" className="iconBtn" aria-label="Propose a solution" disabled={closed || !c.can.propose}
                  title={closed ? 'This case is closed.' : c.can.propose ? 'Propose a solution' : `Proposing a solution needs the Configurer role on ${where}.`}
                  onClick={() => setProposing(true)}
                >
                  <PlusIcon size={16} />
                </button>
              )}
          </section>

          <section aria-label="Messages">
            {c.messages.map(m => (
              <div key={m.messageId} className="caseMessage">
                <p className="feedbackCardText">{m.text}</p>
                <div className="messageMeta"><span className="feedbackCardMeta">{dateOf(m.submittedAt)}</span><ToneBar summary={m.tone} /></div>
              </div>
            ))}
          </section>

          <section aria-label="Status" className="statusRow">
            {closed ? (
              <>
                <span className="feedbackCardMeta">{statusLabel(c)}{c.closedAt ? ` ${dateOf(c.closedAt)}` : ''}{c.closeNote ? `: ${c.closeNote}` : ''}</span>
                <button
                  type="button" className="iconBtn" aria-label="Reopen case" disabled={!c.can.reopen}
                  title={c.can.reopen ? 'Reopen case' : `Reopening needs the Configurer role on ${where}.`} onClick={() => actions.reopen(c.id)}
                >
                  <UnlockIcon size={16} />
                </button>
              </>
            ) : closing ? (
              <CloseForm c={c} onDone={() => setClosing(false)} actions={actions} />
            ) : (
              <button
                type="button" className="iconBtn" aria-label="Close case" disabled={!c.can.close}
                title={c.can.close ? 'Close case' : `Closing a case needs the Planner role on ${where}.`} onClick={() => setClosing(true)}
              >
                <LockIcon size={16} />
              </button>
            )}
          </section>

          <details className="caseHistory">
            <summary>History ({c.history.length})</summary>
            <ul>
              {c.history.length === 0 && <li>Nothing yet.</li>}
              {[...c.history].reverse().map((h, i) => (
                <li key={i}><span className="feedbackCardMeta">{dateOf(h.at)}</span> {(HISTORY_TEXT[h.kind] ?? ((d: string) => d))(h.detail, h.mine)}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </article>
  )
}

export default function ProcessView({ bundle, actions }: { bundle: InboxBundle; actions: ProcessActions }) {
  const [view, setView] = useState<CaseView>('all')
  const [category, setCategory] = useState<ToneCategory | ''>('')
  const [sort, setSort] = useState<CaseSort>('newest')
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const shown = useMemo(() => sortCases(filterCases(bundle.cases, view, category), sort), [bundle.cases, view, category, sort])
  const needs = needsMyVoteCount(bundle.cases)
  const toggle = (id: string) => setOpenIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const VIEWS: Array<[CaseView, string, JSX.Element]> = [
    ['all', 'All cases', <ListIcon key="a" size={16} />],
    ['needs', `Needs my vote${needs ? ` (${needs})` : ''}`, <VotingIcon key="n" size={16} />],
    ['open', 'Open', <UnlockIcon key="o" size={16} />],
    ['closed', 'Closed', <LockIcon key="c" size={16} />],
  ]

  return (
    <div className="processView">
      <div className="processBar">
        <div className="segSwitch" role="group" aria-label="Show cases">
          {VIEWS.map(([key, label, icon]) => (
            <button
              key={key} type="button" aria-pressed={view === key} aria-label={label} title={label}
              className={view === key ? 'segSwitchBtn segSwitchBtn--on' : 'segSwitchBtn'} onClick={() => setView(key)}
            >
              {icon}{key === 'needs' && needs > 0 && <span className="segCount">{needs}</span>}
            </button>
          ))}
        </div>
        <select className="sortSelect" aria-label="Sort cases" value={sort} onChange={e => setSort(e.target.value as CaseSort)}>
          <option value="newest">Newest</option>
          <option value="votes">Most votes</option>
          <option value="page">Page</option>
        </select>
      </div>
      <div className="categoryFilter" role="group" aria-label="Filter by tone">
        {TONE_CATEGORIES.map(cat => (
          <button
            key={cat} type="button" aria-pressed={category === cat} aria-label={CATEGORY_LABEL[cat]} title={CATEGORY_LABEL[cat]}
            className={category === cat ? 'categoryBtn categoryBtn--on' : 'categoryBtn'} onClick={() => setCategory(category === cat ? '' : cat)}
          >
            <ToneSwatch category={cat} />
          </button>
        ))}
      </div>
      <div className="feedbackList">
        {shown.length === 0 && (
          <p className="feedbackCardMeta">{bundle.cases.length === 0 ? 'No statement cases yet.' : 'No cases match.'}</p>
        )}
        {shown.map(c => (
          <CaseCard key={c.id} c={c} bundle={bundle} expanded={openIds.has(c.id)} onToggle={() => toggle(c.id)} actions={actions} />
        ))}
      </div>
    </div>
  )
}
