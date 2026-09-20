import { useMemo, useState } from 'react'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, CloseIcon, PlusIcon } from '../../../icons'
import type {
  FeedbackAdmin, FeedbackChannel, FeedbackSolution, FeedbackVote, InboxBundle, StatementCase, VoteInput,
} from './feedbackTypes'
import {
  BAND_LABEL, channelLabel, filterCases, needsMyVote, needsMyVoteCount, sortCases, statusLabel, tally, toneScoreLabel,
  type CaseSort, type CaseView,
} from './inboxLogic'
import { VoteControl } from './VoteControl'

// Processing: the feedback statement cases (one intention verb + one subject, with the messages
// behind them). Admins vote for and/or against the statement, with notes; admins with
// configuration access to the case's console propose solutions, which are voted on the same
// way; admins with configuration and project plan access close a case as approved or rejected.

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

const HISTORY_TEXT: Record<string, (detail: string) => string> = {
  vote: d => `${d} the statement`,
  'solution-vote': d => d,
  solution: d => d,
  closed: d => `closed the case as ${d}`,
  reopened: () => 'reopened the case',
}

// What the other admins voted, with their notes.
function VoteList({ votes, admins, skip }: { votes: FeedbackVote[]; admins: FeedbackAdmin[]; skip: string }) {
  const others = votes.filter(v => v.adminId !== skip && (v.approve || v.deny))
  if (others.length === 0) return null
  const name = (id: string) => admins.find(a => a.id === id)?.name ?? id
  return (
    <ul className="voteLog">
      {others.map(v => (
        <li key={v.adminId}>
          <span className="voteLogName">{name(v.adminId)}</span>
          {v.approve && <span className="voteMark voteMark--approve" title="For"><CheckIcon size={12} /></span>}
          {v.deny && <span className="voteMark voteMark--deny" title="Against"><CloseIcon size={12} /></span>}
          <span className="voteLogNotes">
            {v.approve && v.approveNote && <span>{v.approveNote}</span>}
            {v.deny && v.denyNote && <span>{v.denyNote}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function SolutionCard({ solution, c, admins, adminId, disabled, reason, actions }: {
  solution: FeedbackSolution; c: StatementCase; admins: FeedbackAdmin[]; adminId: string
  disabled: boolean; reason: string; actions: ProcessActions
}) {
  const t = tally(solution.votes)
  const by = admins.find(a => a.id === solution.proposedBy)?.name ?? solution.proposedBy
  return (
    <div className="solutionCard">
      <div className="solutionHead">
        <span className="solutionTitle">{solution.title}</span>
        <span className="channelPill">{channelLabel(solution.target)}</span>
      </div>
      {solution.description && <p className="solutionText">{solution.description}</p>}
      <p className="feedbackCardMeta">Proposed by {by} · {dateOf(solution.createdAt)} · {t.approve} for · {t.deny} against</p>
      <VoteControl
        vote={solution.votes.find(v => v.adminId === adminId)} label={`the solution ${solution.title}`}
        disabled={disabled} disabledReason={reason}
        onChange={vote => actions.voteSolution(c.id, solution.id, vote)}
      />
      <VoteList votes={solution.votes} admins={admins} skip={adminId} />
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
      <div className="channelAddForm channelAddForm--three">
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
        <button type="button" className="toneBtn toneBtn--active" onClick={() => void submit()}>Propose</button>
        <button type="button" className="toneBtn" onClick={onDone}>Cancel</button>
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
        <button type="button" className="toneBtn" onClick={() => void finish('approved')}><CheckIcon size={14} /> Close as approved</button>
        <button type="button" className="toneBtn" onClick={() => void finish('rejected')}><CloseIcon size={14} /> Close as rejected</button>
        <button type="button" className="toneBtn" onClick={onDone}>Cancel</button>
      </div>
    </div>
  )
}

function CaseCard({ c, bundle, adminId, expanded, onToggle, actions }: {
  c: StatementCase; bundle: InboxBundle; adminId: string; expanded: boolean; onToggle: () => void; actions: ProcessActions
}) {
  const [proposing, setProposing] = useState(false)
  const [closing, setClosing] = useState(false)
  const t = tally(c.votes)
  const closed = c.status !== 'open'
  const where = `${c.channel.page} > ${c.channel.console}`
  const name = (id: string | null) => bundle.admins.find(a => a.id === id)?.name ?? id ?? ''
  const voteReason = closed ? 'This case is closed.' : `Voting needs feedback processing access to ${where}.`
  const needs = needsMyVote(c, adminId)

  return (
    <article className={`caseCard caseCard--${c.status}`} aria-label={`${c.verbName}: ${channelLabel(c.channel)}`}>
      <button type="button" className="caseHead" aria-expanded={expanded} onClick={onToggle}>
        {expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        <span className="caseHeadMain">
          <span className="caseVerb">{c.verbName}</span>
          <span className="caseChannel">{channelLabel(c.channel)}</span>
        </span>
        <span className={`statusChip statusChip--${c.status}`}>{statusLabel(c)}</span>
        <span className="caseTally">{t.approve} for · {t.deny} against · {c.messages.length} {c.messages.length === 1 ? 'message' : 'messages'}</span>
        {needs && <span className="needsDot" title="Needs your vote" aria-label="Needs your vote" />}
      </button>
      {expanded && (
        <div className="caseBody">
          <section aria-label="Messages">
            <h4 className="caseStageTitle">Messages</h4>
            {c.messages.map(m => (
              <div key={m.messageId} className="caseMessage">
                <p className="feedbackCardText">&ldquo;{m.text}&rdquo;</p>
                <p className="feedbackCardMeta">
                  {m.author} · {dateOf(m.submittedAt)}
                  <span className={`toneBand toneBand--${m.tone.band}`}>{BAND_LABEL[m.tone.band]} · {toneScoreLabel(m.tone)}</span>
                </p>
              </div>
            ))}
          </section>

          <section aria-label="Your vote on the statement">
            <h4 className="caseStageTitle">Do you agree this should happen?</h4>
            <VoteControl
              vote={c.votes.find(v => v.adminId === adminId)} label="this statement"
              disabled={closed || !c.can.vote} disabledReason={voteReason}
              onChange={vote => actions.voteCase(c.id, vote)}
            />
            {!closed && !c.can.vote && <p className="feedbackCardMeta">{voteReason}</p>}
            <VoteList votes={c.votes} admins={bundle.admins} skip={adminId} />
          </section>

          <section aria-label="Solutions">
            <h4 className="caseStageTitle">Solutions ({c.solutions.length})</h4>
            {c.solutions.length === 0 && <p className="feedbackCardMeta">No solution proposed yet.</p>}
            {c.solutions.map(s => (
              <SolutionCard
                key={s.id} solution={s} c={c} admins={bundle.admins} adminId={adminId}
                disabled={closed || !c.can.vote} reason={voteReason} actions={actions}
              />
            ))}
            {proposing
              ? <ProposeForm c={c} bundle={bundle} onDone={() => setProposing(false)} actions={actions} />
              : (
                <div className="toneRow">
                  <button
                    type="button" className="toneBtn" disabled={closed || !c.can.propose}
                    title={closed ? 'This case is closed.' : c.can.propose ? undefined : `Proposing a solution needs configuration access to ${where}.`}
                    onClick={() => setProposing(true)}
                  >
                    <PlusIcon size={14} /> Propose solution
                  </button>
                  {!closed && !c.can.propose && <span className="feedbackCardMeta">Needs configuration access to {where}</span>}
                </div>
              )}
          </section>

          <section aria-label="Status">
            {closed ? (
              <>
                <p className="feedbackCardMeta">
                  {statusLabel(c)} by {name(c.closedBy)}{c.closedAt ? ` on ${dateOf(c.closedAt)}` : ''}{c.closeNote ? `: ${c.closeNote}` : ''}
                </p>
                <div className="toneRow">
                  <button
                    type="button" className="toneBtn" disabled={!c.can.reopen}
                    title={c.can.reopen ? undefined : `Reopening needs configuration access to ${where}.`}
                    onClick={() => actions.reopen(c.id)}
                  >
                    Reopen case
                  </button>
                  {!c.can.reopen && <span className="feedbackCardMeta">Needs configuration access to {where}</span>}
                </div>
              </>
            ) : closing ? (
              <CloseForm c={c} onDone={() => setClosing(false)} actions={actions} />
            ) : (
              <div className="toneRow">
                <button
                  type="button" className="toneBtn" disabled={!c.can.close}
                  title={c.can.close ? undefined : `Closing a case needs configuration and project plan access to ${where}.`}
                  onClick={() => setClosing(true)}
                >
                  Close case
                </button>
                {!c.can.close && <span className="feedbackCardMeta">Needs configuration and project plan access to {where}</span>}
              </div>
            )}
          </section>

          <details className="caseHistory">
            <summary>History ({c.history.length})</summary>
            <ul>
              {c.history.length === 0 && <li>Nothing yet.</li>}
              {[...c.history].reverse().map((h, i) => (
                <li key={i}>
                  <span className="feedbackCardMeta">{dateOf(h.at)}</span> {name(h.adminId)} {(HISTORY_TEXT[h.kind] ?? (d => d))(h.detail)}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </article>
  )
}

export default function ProcessView({ bundle, adminId, actions }: { bundle: InboxBundle; adminId: string; actions: ProcessActions }) {
  const [view, setView] = useState<CaseView>('all')
  const [page, setPage] = useState('')
  const [sort, setSort] = useState<CaseSort>('newest')
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const shown = useMemo(
    () => sortCases(filterCases(bundle.cases, view, page, adminId), sort),
    [bundle.cases, view, page, sort, adminId],
  )
  const needs = needsMyVoteCount(bundle.cases, adminId)
  const toggle = (id: string) => setOpenIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const pages = [...new Set(bundle.cases.map(c => c.channel.page))]
  const VIEWS: Array<[CaseView, string]> = [['all', 'All'], ['needs', `Needs my vote${needs ? ` (${needs})` : ''}`], ['open', 'Open'], ['closed', 'Closed']]

  return (
    <div className="processView">
      <div className="segSwitch segSwitch--wrap" role="group" aria-label="Show cases">
        {VIEWS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={view === key} className={view === key ? 'segSwitchBtn segSwitchBtn--on' : 'segSwitchBtn'} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>
      <div className="channelAddForm">
        <select aria-label="Filter by page" value={page} onChange={e => setPage(e.target.value)}>
          <option value="">All pages</option>
          {pages.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select aria-label="Sort cases" value={sort} onChange={e => setSort(e.target.value as CaseSort)}>
          <option value="newest">Newest feedback</option>
          <option value="votes">Most votes</option>
          <option value="page">Page and console</option>
        </select>
      </div>
      <div className="feedbackList">
        {shown.length === 0 && (
          <p className="feedbackCardMeta">
            {bundle.cases.length === 0
              ? `No statement cases yet. A message joins its cases once ${bundle.requiredValidations} ${bundle.requiredValidations === 1 ? 'admin has' : 'admins have'} validated it.`
              : 'No cases match these filters.'}
          </p>
        )}
        {shown.map(c => (
          <CaseCard key={c.id} c={c} bundle={bundle} adminId={adminId} expanded={openIds.has(c.id)} onToggle={() => toggle(c.id)} actions={actions} />
        ))}
      </div>
    </div>
  )
}
