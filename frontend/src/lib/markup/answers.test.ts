import { describe, expect, it } from 'vitest'
import { allowedTypos, editDistance, matchesTextAnswer, normalizeAnswer } from './answers'
import { parseMarkup, type QuestionBlock } from './parse'
import { answered, emptyResponse, scoreQuestion, scoreQuiz } from './score'

const question = (text: string) => parseMarkup(text).blocks[0] as QuestionBlock

describe('text answers', () => {
  it('ignore capitals, extra spaces, punctuation and accents', () => {
    expect(normalizeAnswer('  Café,   au LAIT!  ')).toBe('cafe au lait')
    expect(matchesTextAnswer('THE  moment.', ['the moment'])).toBe(true)
  })

  it('allow small typos by length, a swap counting as one', () => {
    expect([allowedTypos('cat'), allowedTypos('paris'), allowedTypos('chapters ok')]).toEqual([0, 1, 2])
    expect(editDistance('paris', 'pairs')).toBe(1)
    expect(matchesTextAnswer('cot', ['cat'])).toBe(false)
    expect(matchesTextAnswer('pairs', ['Paris'])).toBe(true)
    expect(matchesTextAnswer('parsi', ['Paris'])).toBe(true)
    expect(matchesTextAnswer('pxrxs', ['Paris'])).toBe(false)
    expect(matchesTextAnswer('protagonsit', ['protagonist'])).toBe(true)
    expect(matchesTextAnswer('protagnoist x', ['protagonist'])).toBe(false)
  })

  it('take any of the accepted answers, and never an empty one', () => {
    expect(matchesTextAnswer('moment', ['scene', 'Moment'])).toBe(true)
    expect(matchesTextAnswer('   ', ['x'])).toBe(false)
    expect(matchesTextAnswer('x', [''])).toBe(false)
  })
})

describe('scoring', () => {
  it('marks multiple choice and text right or wrong', () => {
    const choice = question('???? Which?\n?? a\n?! b')
    expect(scoreQuestion(choice, { kind: 'choice', picked: 1 })).toBe(1)
    expect(scoreQuestion(choice, { kind: 'choice', picked: 0 })).toBe(0)
    const text = question('???? Name?\n? here\n! Ada')
    expect(scoreQuestion(text, { kind: 'text', text: 'ada' })).toBe(1)
    expect(scoreQuestion(text, { kind: 'text', text: 'Bob' })).toBe(0)
  })

  it('gives a share for checkboxes: right ticks less wrong ones, over the right ones, never below 0', () => {
    const boxes = question('???? Pick\n??! a\n??! b\n??! c\n??? d')
    expect(scoreQuestion(boxes, { kind: 'checkbox', ticked: [0, 1, 2] })).toBe(1)
    expect(scoreQuestion(boxes, { kind: 'checkbox', ticked: [0, 1] })).toBeCloseTo(2 / 3)
    expect(scoreQuestion(boxes, { kind: 'checkbox', ticked: [0, 1, 3] })).toBeCloseTo(1 / 3)
    expect(scoreQuestion(boxes, { kind: 'checkbox', ticked: [3] })).toBe(0)
  })

  it('knows when something is answered, and averages a quiz', () => {
    const boxes = question('???? Pick\n??! a')
    expect(answered(emptyResponse(boxes))).toBe(false)
    expect(answered({ kind: 'checkbox', ticked: [0] })).toBe(true)
    expect(scoreQuiz([1, 0.5, 0])).toBe(50)
    expect(scoreQuiz([])).toBe(0)
  })
})
