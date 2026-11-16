import { useMemo, useState } from 'react'
import { CheckIcon, RestoreIcon, SparkleIcon } from '../../assets/icons'
import { needsLinks } from '../../lib/markup/checks'
import { parseCached, type QuestionBlock } from '../../lib/markup/parse'
import { resolvePullIn } from '../../lib/markup/pullIns'
import { emptyResponse, scoreQuestion, scoreQuiz, type Response } from '../../lib/markup/score'
import { useLinkContext } from './linkContext'
import Markup, { QuestionSlotCtx, type QuestionSlot } from './Markup'
import { QuestionView } from './QuestionView'

// Taking a Training quiz, test or exam: every question on one page with the text between them (questions pulled in count like its own),
// hints allowed and never Show the answer. Submit marks it: multiple choice and text right or wrong, check boxes a share; the score is the
// mean of the shares, out of 100, kept as a result (`onSubmit`). Then a review that highlights, dims and explains as practice does, and
// Take it again.

export function QuizTaker({ text, passMark, onSubmit }: { text: string; passMark: number; onSubmit: (score: number) => void | Promise<void> }) {
  const { blocks } = parseCached(text)
  const links = useLinkContext(text, needsLinks(blocks))
  const questions = useMemo(() => {
    const out: Array<{ key: string; q: QuestionBlock }> = []
    for (const b of blocks) {
      if (b.kind === 'question') out.push({ key: `q${b.line}`, q: b })
      else if (b.kind === 'pullin') {
        const r = resolvePullIn(b.ref, links)
        if (r.status === 'ok') out.push({ key: `p${b.line}`, q: r.question })
      }
    }
    return out
  }, [blocks, links])
  const [responses, setResponses] = useState<Record<string, Response>>({})
  const [hints, setHints] = useState<Record<string, number>>({})
  const [score, setScore] = useState<number | null>(null)
  const revealed = score !== null
  const numberOf = new Map(questions.map((x, k) => [x.key, k + 1]))

  const slot: QuestionSlot = (q, key) => {
    const response = responses[key] ?? emptyResponse(q)
    const shown = hints[key] ?? 0
    const share = scoreQuestion(q, response)
    const right = q.options.filter(o => o.correct).length
    const said = !revealed ? '' : share === 1 ? 'Right.' : share > 0 && q.type === 'checkbox' ? `${Math.round(share * right)} of ${right}.` : 'Not right.'
    return (
      <div className={`mkQuestion${revealed ? ' mkQuestion--revealed' : ''}`} role="group" aria-label={`Question ${numberOf.get(key) ?? ''}`}>
        <QuestionView q={q} response={response} onChange={next => setResponses(s => ({ ...s, [key]: next }))} revealed={revealed} hints={shown} />
        {(q.hints.length > 0 || said) && (
          <div className="mkQuestionBar">
            {!revealed && q.hints.length > 0 && (
              <button type="button" className="mkIconBtn" aria-label="Hint" title={`Hint (${shown} of ${q.hints.length})`} disabled={shown >= q.hints.length} onClick={() => setHints(s => ({ ...s, [key]: shown + 1 }))}><SparkleIcon size={16} /></button>
            )}
            {said && <span className="mkResult">{said}</span>}
          </div>
        )}
      </div>
    )
  }

  const submit = async () => {
    const shares = questions.map(({ key, q }) => scoreQuestion(q, responses[key] ?? emptyResponse(q)))
    const next = Math.round(scoreQuiz(shares) * 10) / 10
    setScore(next)
    await onSubmit(next)
  }
  const again = () => { setResponses({}); setHints({}); setScore(null) }

  return (
    <div className="mkQuiz">
      <QuestionSlotCtx.Provider value={slot}>
        <Markup text={text} baseLevel={4} empty={<p className="mkEmpty">No questions yet.</p>} />
      </QuestionSlotCtx.Provider>
      <div className="mkQuizBar">
        {!revealed && (
          <button type="button" className="mkIconBtn mkIconBtn--wide" aria-label="Submit" title="Submit" disabled={questions.length === 0} onClick={() => { void submit() }}><CheckIcon size={16} /></button>
        )}
        <span className="mkResult" role="status">{revealed ? `Score ${score}% · ${score! >= passMark ? 'passed' : 'not passed'} (pass mark ${passMark}%)` : ''}</span>
        {revealed && <button type="button" className="mkIconBtn" aria-label="Take it again" title="Take it again" onClick={again}><RestoreIcon size={16} /></button>}
      </div>
    </div>
  )
}

export default QuizTaker
