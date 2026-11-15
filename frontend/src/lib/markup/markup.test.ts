import { describe, expect, it } from 'vitest'
import { anchorsFor, headingWords } from './anchors'
import { checksOf } from './checks'
import { inlineText, parseInline } from './inline'
import { classifyLine } from './lines'
import { parseCached, parseMarkup, type Block, type QuestionBlock } from './parse'
import { plainTextOf } from './plainText'

const blocks = (text: string) => parseMarkup(text).blocks
const only = <K extends Block['kind']>(text: string, kind: K) => blocks(text).filter((b): b is Extract<Block, { kind: K }> => b.kind === kind)
const labels = (text: string) => only(text, 'list').flatMap(l => l.items.map(i => i.label))
const question = (text: string) => only(text, 'question')[0] as QuestionBlock

describe('lines', () => {
  it('reads each marker, after any spaces, and needs a space after headings, lists and quotes', () => {
    expect(classifyLine('###### Big')).toEqual({ kind: 'heading', level: 6, text: 'Big' })
    expect(classifyLine('  # Small')).toEqual({ kind: 'heading', level: 1, text: 'Small' })
    expect(classifyLine('#hashtag')).toEqual({ kind: 'text', text: '#hashtag' })
    expect(classifyLine('>>> ring')).toEqual({ kind: 'list', depth: 3, text: 'ring' })
    expect(classifyLine('" said')).toEqual({ kind: 'quote', text: 'said' })
    expect(classifyLine('####### seven')).toEqual({ kind: 'unknown', marker: '#######', text: 'seven' })
    expect(classifyLine('>>>>> five')).toEqual({ kind: 'unknown', marker: '>>>>>', text: 'five' })
    expect(classifyLine('\\# not')).toEqual({ kind: 'text', text: '\\# not' })
    expect(classifyLine('   ')).toEqual({ kind: 'blank' })
  })

  it('takes the longest knowledge-check marker, and a question’s id', () => {
    const marker = (l: string) => { const c = classifyLine(l); return c.kind === 'check' ? c.marker : c.kind }
    expect(['????? @x#q1', '???? Q', '???! hint', '??? no', '??! yes', '?!! why', '?? no', '?! yes', '!! why', '? type', '! ans'].map(marker))
      .toEqual(['?????', '????', '???!', '???', '??!', '?!!', '??', '?!', '!!', '?', '!'])
    expect(classifyLine('????#q7f3a What?')).toEqual({ kind: 'check', marker: '????', text: 'What?', id: 'q7f3a' })
    expect(classifyLine('?????@writer@draft#q1')).toEqual({ kind: 'check', marker: '?????', text: '@writer@draft#q1', id: null })
  })
})

describe('inline', () => {
  it('pairs runs of three, two and one stars, nested', () => {
    expect(parseInline('***a*** **b** *c*')).toEqual([
      { t: 'strongEm', children: [{ t: 'text', text: 'a' }] }, { t: 'text', text: ' ' },
      { t: 'strong', children: [{ t: 'text', text: 'b' }] }, { t: 'text', text: ' ' },
      { t: 'em', children: [{ t: 'text', text: 'c' }] },
    ])
    expect(parseInline('**bold *it* bold**')).toEqual([{ t: 'strong', children: [{ t: 'text', text: 'bold ' }, { t: 'em', children: [{ t: 'text', text: 'it' }] }, { t: 'text', text: ' bold' }] }])
  })

  it('keeps stars that have no partner or touch spaces', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ t: 'text', text: '2 * 3 * 4' }])
    expect(parseInline('*open')).toEqual([{ t: 'text', text: '*open' }])
    expect(parseInline('a ** b')).toEqual([{ t: 'text', text: 'a ** b' }])
    expect(inlineText(parseInline('**a *b**'))).toBe('a *b')
  })

  it('shows an escaped marker as text and leaves other backslashes as typed', () => {
    expect(parseInline('\\*not\\* \\@me \\\\ C:\\Users')).toEqual([{ t: 'text', text: '*not* @me \\ C:\\Users' }])
  })
})

describe('blocks', () => {
  it('makes paragraphs at blank lines, keeping single line breaks', () => {
    const [a, b] = only('one\ntwo\n\nthree', 'paragraph')
    expect(a.lines.map(inlineText)).toEqual(['one', 'two'])
    expect(b.lines.map(inlineText)).toEqual(['three'])
  })

  it('numbers lists as the user asked', () => {
    expect(labels('>> a\n>> b\n>>>> b1\n>>>> b2\n>> c\n>>>> c1')).toEqual(['1.', '2.', '2.1', '2.2', '3.', '3.1'])
    expect(labels('> dot\n>>>> one\n>>>> two')).toEqual(['•', '1.', '2.'])
    expect(labels('>> a\n\n>> b\n>>> ring')).toEqual(['1.', '2.', '◦'])
    // after other text the numbers start again
    expect(labels('>> a\n>> b\n\ntext\n\n>> again')).toEqual(['1.', '2.', '1.'])
    expect(only('>> a\n\ntext\n\n>> b', 'list')).toHaveLength(2)
  })

  it('makes one quote of quote lines together, and headings their own blocks with anchors', () => {
    const [q] = only('" one\n" two\ntext', 'quote')
    expect(q.lines.map(inlineText)).toEqual(['one', 'two'])
    const hs = only('###### Start here\ntext\n# Start here', 'heading')
    expect(hs.map(h => [h.level, h.anchor])).toEqual([[6, 'start-here'], [1, 'start-here-2']])
    expect(blocks('###### Start here\ntext')[1].kind).toBe('paragraph')
  })

  it('groups a question with its lines, blank lines inside too, and ends it at other text', () => {
    const q = question('????#q1 Which?\n???! think\n\n?! yes\n!! because\n?? no\nafter')
    expect(q.id).toBe('q1')
    expect(inlineText(q.prompt)).toBe('Which?')
    expect(q.type).toBe('choice')
    expect(q.hints.map(inlineText)).toEqual(['think'])
    expect(q.options.map(o => [inlineText(o.inline), o.correct, o.explanation.map(inlineText)])).toEqual([['yes', true, ['because']], ['no', false, []]])
    expect(blocks('????#q1 Which?\n?! yes\nafter').map(b => b.kind)).toEqual(['question', 'paragraph'])
  })

  it('takes its kind from its first option', () => {
    const q = question('???? Pick\n??! a\n?? b\n?!! why b')
    expect(q.type).toBe('checkbox')
    expect(q.options.map(o => o.correct)).toEqual([true, false])
    const t = question('???? Capital?\n? City\n! Paris\n! paris, France')
    expect([t.type, t.placeholder, t.answers]).toEqual(['text', 'City', ['Paris', 'paris, France']])
  })

  it('shows check lines outside a question as text, and pull-ins as their own blocks', () => {
    const [p] = only('?! stray', 'paragraph')
    expect(p.lines.map(inlineText)).toEqual(['?! stray'])
    expect(only('?????@writer@draft#q1', 'pullin')[0].ref).toBe('@writer@draft#q1')
  })

  it('remembers what it read', () => {
    expect(parseCached('# a')).toBe(parseCached('# a'))
  })
})

describe('checks', () => {
  it('lists what is wrong, by line', () => {
    const text = [
      '####### seven', // 1
      '?! stray', // 2
      '???? No right', // 3
      '?? a', // 4
      '???? No answer', // 5
      '? type', // 6
      '???? Why?', // 7
      '!! nothing above', // 8
      '?! yes', // 9
      '????#q1 One', // 10
      '?! y', // 11
      '????#q1 Two', // 12
      '?! y', // 13
    ].join('\n')
    expect(checksOf(text).map(c => [c.line, c.message])).toEqual([
      [1, '####### is not a heading: they go from # to ######.'],
      [2, 'An option outside a question.'],
      [3, 'This question has no right option.'],
      [5, 'This question has no accepted answer.'],
      [8, 'An explanation with no option above it.'],
      [12, 'Question id q1 is used twice (first on line 10).'],
    ])
    expect(checksOf('# Fine\n\n???? Q\n?! a')).toEqual([])
  })
})

describe('plain text', () => {
  it('copies the words, never the answers, hints or explanations', () => {
    const text = '###### Title\n\nSome **bold** text.\n\n> dot\n>> one\n>>>> one.one\n\n" quoted\n\n???? Which?\n???! a hint\n?! yes\n!! secret\n?? no\n\n???? Name?\n? here\n! Ada'
    expect(plainTextOf(text)).toBe('Title\n\nSome bold text.\n\n• dot\n1. one\n    1.1 one.one\n\n“quoted”\n\nWhich?\n○ yes\n○ no\n\nName?\n____ (here)')
  })
})

describe('anchors', () => {
  it('are the heading’s words', () => {
    expect(headingWords('Café: the  Plot—Lines!')).toBe('cafe-the-plot-lines')
    expect(anchorsFor(['A', 'a', 'A'])).toEqual(['a', 'a-2', 'a-3'])
  })
})
