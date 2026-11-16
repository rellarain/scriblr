import { useId, useState } from 'react'
import { CheckIcon, CloseIcon, EyeIcon, SparkleIcon } from '../../assets/icons'
import type { QuestionBlock } from '../../lib/markup/parse'
import { answered, emptyResponse, scoreQuestion, type Response } from '../../lib/markup/score'
import { renderInline } from './renderInline'

// A knowledge check. `QuestionView` is the question and its controls (radio buttons for multiple choice, check boxes, or a text field) with
// the hints shown so far; once revealed, the right options are highlighted, the others dimmed, every explanation shown and, for a text field,
// the accepted answers. `PracticeQuestion` is a practice question in an article or a lesson: Hint (one hint a press), Check, and Show the
// answer at any time; either of the last two reveals it, and it stays answered. Nothing is saved.

export function QuestionView({ q, response, onChange, revealed, hints }: {
  q: QuestionBlock
  response: Response
  onChange: (r: Response) => void
  revealed: boolean
  hints: number
}) {
  const id = useId()
  const promptId = `${id}-prompt`
  const state = (correct: boolean, chosen: boolean) => (!revealed ? '' : correct ? ' mkOption--right' : chosen ? ' mkOption--wrong' : ' mkOption--dim')
  return (
    <>
      <p id={promptId} className="mkPrompt">{renderInline(q.prompt)}</p>
      {q.type === 'text' && response.kind === 'text' && (
        <>
          <input
            className="mkAnswerField" type="text" placeholder={q.placeholder} aria-label="Your answer" aria-describedby={promptId} value={response.text}
            disabled={revealed} onChange={e => onChange({ kind: 'text', text: e.target.value })}
          />
          {revealed && q.answers.length > 0 && (
            <p className="mkAccepted"><span className="mkAcceptedLabel">Accepted:</span> {q.answers.map((a, k) => <span key={k} className="mkAcceptedAnswer">{a}</span>)}</p>
          )}
        </>
      )}
      {(q.type === 'choice' || q.type === 'checkbox') && (
        <div className="mkOptions" role={q.type === 'choice' ? 'radiogroup' : 'group'} aria-labelledby={promptId}>
          {q.options.map((o, k) => {
            const chosen = response.kind === 'choice' ? response.picked === k : response.kind === 'checkbox' && response.ticked.includes(k)
            return (
              <div key={o.line} className={`mkOption${state(o.correct, chosen)}`}>
                <label className="mkOptionLabel">
                  <input
                    type={q.type === 'choice' ? 'radio' : 'checkbox'} name={`${id}-options`} checked={chosen} disabled={revealed}
                    onChange={() => onChange(response.kind === 'checkbox'
                      ? { kind: 'checkbox', ticked: chosen ? response.ticked.filter(x => x !== k) : [...response.ticked, k].sort((a, b) => a - b) }
                      : { kind: 'choice', picked: k })}
                  />
                  <span className="mkOptionText">{renderInline(o.inline)}</span>
                  {revealed && o.correct && <span className="mkOptionMark" aria-label="right" role="img"><CheckIcon size={14} /></span>}
                  {revealed && !o.correct && chosen && <span className="mkOptionMark" aria-label="wrong" role="img"><CloseIcon size={14} /></span>}
                </label>
                {revealed && o.explanation.length > 0 && <p className="mkExplanation">{o.explanation.map((e, j) => <span key={j}>{j > 0 && <br />}{renderInline(e)}</span>)}</p>}
              </div>
            )
          })}
        </div>
      )}
      {hints > 0 && (
        <ul className="mkHints" role="list" aria-label="Hints">
          {q.hints.slice(0, hints).map((h, k) => <li key={k} className="mkHint">{renderInline(h)}</li>)}
        </ul>
      )}
    </>
  )
}

export function PracticeQuestion({ q }: { q: QuestionBlock }) {
  const [response, setResponse] = useState<Response>(() => emptyResponse(q))
  const [hints, setHints] = useState(0)
  const [state, setState] = useState<'asking' | 'checked' | 'shown'>('asking')
  const revealed = state !== 'asking'
  const share = scoreQuestion(q, response)
  const right = q.options.filter(o => o.correct).length
  const result = state !== 'checked' ? '' : share === 1 ? 'Right.' : share > 0 && q.type === 'checkbox' ? `${Math.round(share * right)} of ${right}.` : 'Not quite.'
  return (
    <div className={`mkQuestion${revealed ? ' mkQuestion--revealed' : ''}`} role="group" aria-label="Practice question">
      <QuestionView q={q} response={response} onChange={setResponse} revealed={revealed} hints={hints} />
      {q.type !== null && (
        <div className="mkQuestionBar">
          {q.hints.length > 0 && (
            <button type="button" className="mkIconBtn" aria-label="Hint" title={`Hint (${Math.min(hints, q.hints.length)} of ${q.hints.length})`} disabled={revealed || hints >= q.hints.length} onClick={() => setHints(h => h + 1)}><SparkleIcon size={16} /></button>
          )}
          <button type="button" className="mkIconBtn" aria-label="Check" title="Check" disabled={revealed || !answered(response)} onClick={() => setState('checked')}><CheckIcon size={16} /></button>
          <button type="button" className="mkIconBtn" aria-label="Show the answer" title="Show the answer" disabled={revealed} onClick={() => setState('shown')}><EyeIcon size={16} /></button>
          <span className="mkResult" role="status">{result}</span>
        </div>
      )}
    </div>
  )
}

export default PracticeQuestion
