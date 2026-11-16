import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as resourcesApi from '../../api/resourcesApi'
import * as trainingApi from '../../api/trainingApi'
import type { ResourcesFile, TrainingState } from '../../api/types'
import Markup from './Markup'
import QuizTaker from './QuizTaker'

// Quiz texts (K4): a question pulled in shows as practice, and a quiz is taken on one page: Hint allowed, Submit marks it (check boxes earn a
// share), the score is kept, then a review and Take it again.

const FILE: ResourcesFile = {
  schemaVersion: 2,
  nodes: [{ id: 'writer', kind: 'interface', parentId: null, order: 0, name: 'Writer' }, { id: 'writer/draft', kind: 'console', parentId: 'writer', order: 0, name: 'Draft' }],
  content: {},
  assessments: { 'writer/draft': { text: '????#q7f3a Which saves your work?\n?! Save\n?? Undo' } },
}
const TRAINING: TrainingState = { content: { schemaVersion: 2, curricula: [], courses: [] }, progress: { schemaVersion: 2, enrolled: {}, completed: {}, attempts: {} } }
const serve = () => {
  vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(FILE)
  vi.spyOn(trainingApi, 'getTraining').mockResolvedValue(TRAINING)
}

describe('a pulled-in question', () => {
  it('shows as a practice question, and one that pulls in nothing gets a mark', async () => {
    serve()
    render(<Markup text={'?????@writer@draft#q7f3a\n\n?????@writer@draft#gone'} />)
    const q = within(await screen.findByRole('group', { name: 'Practice question' }))
    expect(q.getByText('Which saves your work?')).toBeInTheDocument()
    expect(q.getByRole('radio', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByText('@writer@draft#gone').closest('.mkPullin')).toHaveTextContent('not found')
  })
})

describe('taking a quiz', () => {
  const QUIZ = '###### Before you start\n\nRead each question.\n\n????#a Pick two\n???! think\n??! one\n??! two\n??? three\n\n????#b Name it\n? here\n! moment\n\n?????@writer@draft#q7f3a'

  it('shows every question with the text between them, marks it on Submit, and keeps the score', async () => {
    serve()
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuizTaker text={QUIZ} passMark={70} onSubmit={onSubmit} />)
    expect(screen.getByRole('heading', { name: 'Before you start' })).toBeInTheDocument()
    const one = within(screen.getByRole('group', { name: 'Question 1' }))
    expect(one.queryByRole('button', { name: 'Show the answer' })).toBeNull()
    await user.click(one.getByRole('button', { name: 'Hint' }))
    expect(one.getByText('think')).toBeInTheDocument()
    await user.click(one.getByRole('checkbox', { name: 'one' }))
    await user.type(within(screen.getByRole('group', { name: 'Question 2' })).getByRole('textbox', { name: 'Your answer' }), 'Moment')
    const three = within(await screen.findByRole('group', { name: 'Question 3' }))
    await user.click(three.getByRole('radio', { name: 'Undo' }))
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    // one of two boxes (0.5), the name (1), the wrong choice (0): 50
    expect(onSubmit).toHaveBeenCalledWith(50)
    expect(screen.getByRole('status')).toHaveTextContent('Score 50% · not passed (pass mark 70%)')
    // the review: highlighted, dimmed, explained
    expect(one.getByText('1 of 2.')).toBeInTheDocument()
    expect(one.getByText('two').closest('.mkOption')).toHaveClass('mkOption--right')
    expect(three.getByText('Not right.')).toBeInTheDocument()
    expect(three.getByRole('radio', { name: /Undo/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Take it again' }))
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'Question 1' })).getByRole('checkbox', { name: 'one' })).not.toBeChecked())
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
  })

  it('cannot be submitted with no questions', () => {
    serve()
    render(<QuizTaker text={'Just words.'} passMark={70} onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })
})
