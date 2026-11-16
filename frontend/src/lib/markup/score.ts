import { matchesTextAnswer } from './answers'
import type { QuestionBlock } from './parse'

// How a question was answered, and what it earns (0 to 1): a multiple-choice or text question is right or wrong; a checkbox question earns a
// share, the right boxes ticked less the wrong ones, over how many are right (never below 0).

export type Response =
  | { kind: 'choice'; picked: number | null }
  | { kind: 'checkbox'; ticked: number[] }
  | { kind: 'text'; text: string }

export function emptyResponse(q: QuestionBlock): Response {
  return q.type === 'checkbox' ? { kind: 'checkbox', ticked: [] } : q.type === 'text' ? { kind: 'text', text: '' } : { kind: 'choice', picked: null }
}

// Whether anything has been chosen or typed.
export function answered(r: Response): boolean {
  return r.kind === 'choice' ? r.picked !== null : r.kind === 'checkbox' ? r.ticked.length > 0 : r.text.trim() !== ''
}

export function scoreQuestion(q: QuestionBlock, r: Response): number {
  if (q.type === 'text') return r.kind === 'text' && matchesTextAnswer(r.text, q.answers) ? 1 : 0
  if (q.type === 'choice') return r.kind === 'choice' && r.picked !== null && q.options[r.picked]?.correct ? 1 : 0
  if (q.type === 'checkbox') {
    if (r.kind !== 'checkbox') return 0
    const right = q.options.filter(o => o.correct).length
    if (right === 0) return 0
    const ticked = new Set(r.ticked)
    const good = q.options.filter((o, k) => o.correct && ticked.has(k)).length
    const bad = q.options.filter((o, k) => !o.correct && ticked.has(k)).length
    return Math.max(0, (good - bad) / right)
  }
  return 0
}

// A quiz's score, 0 to 100: the mean of its questions' shares.
export function scoreQuiz(shares: number[]): number {
  if (shares.length === 0) return 0
  return (shares.reduce((a, b) => a + b, 0) / shares.length) * 100
}
