import { describe, expect, it } from 'vitest'
import { getKv, setKv } from '../../../settings/settingsStore'
import { emptyProgress, seedContent, learningBackend } from '../../../test/learningBackend'
import { __resetLearningForTests, adoptLearning, enrol, getLearningData, leave, loadLearning, recordAttempt, saveContent, setCompleted } from './learningStore'

describe('the Learning store', () => {
  it('starts idle, loads once (calls in flight share one request) and keeps what it loaded', async () => {
    const backend = learningBackend()
    expect(getLearningData().status).toBe('idle')
    const first = loadLearning()
    expect(getLearningData().status).toBe('loading')
    await Promise.all([first, loadLearning()])
    expect(getLearningData().status).toBe('ready')
    expect(getLearningData().training?.content.curricula).toHaveLength(5)
    await loadLearning()
    expect(backend.calls.filter(c => c === 'GET /training')).toHaveLength(1)
    await loadLearning(true)
    expect(backend.calls.filter(c => c === 'GET /training')).toHaveLength(2)
  })

  it('says what went wrong when it cannot load, and loads when asked again', async () => {
    const backend = learningBackend()
    backend.failNext('/training', 409, 'shard corrupt and quarantined')
    await loadLearning()
    expect(getLearningData()).toMatchObject({ status: 'error', error: 'shard corrupt and quarantined', training: null })
    await loadLearning(true)
    expect(getLearningData().status).toBe('ready')
    expect(getLearningData().error).toBeNull()
  })

  it('adopts a state handed to it, as ready, clearing an error', async () => {
    const backend = learningBackend()
    backend.failNext('/training', 500, 'down')
    await loadLearning()
    expect(getLearningData().status).toBe('error')
    adoptLearning({ content: seedContent(), progress: emptyProgress() })
    expect(getLearningData()).toMatchObject({ status: 'ready', error: null, actionError: null })
    expect(getLearningData().training?.content.curricula).toHaveLength(5)
  })

  it('takes the state each action answers with: enrol, leave, mark complete and not, and a result', async () => {
    learningBackend()
    await loadLearning()
    await enrol('writer-c1')
    expect(Object.keys(getLearningData().training!.progress.enrolled)).toEqual(['writer-c1'])
    await setCompleted('writer-c1-m1', true)
    expect(Object.keys(getLearningData().training!.progress.completed)).toEqual(['writer-c1-m1'])
    await setCompleted('writer-c1-m1', false)
    expect(getLearningData().training!.progress.completed).toEqual({})
    await recordAttempt('writer-c1-m1-l1-q1', 80)
    const progress = getLearningData().training!.progress
    expect(progress.attempts['writer-c1-m1-l1-q1'][0]).toMatchObject({ score: 80, passed: true })
    expect(Object.keys(progress.completed)).toEqual(['writer-c1-m1-l1'])
    await leave('writer-c1')
    expect(getLearningData().training!.progress.enrolled).toEqual({})
  })

  it('keeps the state it had, and says why, when an action fails (and forgets it after one that works)', async () => {
    const backend = learningBackend()
    await loadLearning()
    backend.failNext('/training/enrolments/writer-c1', 500, 'Nope.')
    await enrol('writer-c1')
    expect(getLearningData().actionError).toBe('Nope.')
    expect(getLearningData().training!.progress.enrolled).toEqual({})
    await enrol('writer-c1')
    expect(getLearningData().actionError).toBeNull()
    expect(Object.keys(getLearningData().training!.progress.enrolled)).toEqual(['writer-c1'])
  })

  it('saves the courses, which drops the progress of what is gone', async () => {
    learningBackend()
    await loadLearning()
    await enrol('reader-c1')
    await enrol('writer-c1')
    const { curricula, courses } = getLearningData().training!.content
    await saveContent({ curricula: curricula.map(c => ({ ...c, courseIds: c.courseIds.filter(id => id !== 'reader-c1') })), courses: courses.filter(c => c.id !== 'reader-c1') })
    expect(getLearningData().training!.content.courses.map(c => c.id)).not.toContain('reader-c1')
    expect(Object.keys(getLearningData().training!.progress.enrolled)).toEqual(['writer-c1'])
  })

  it('carries the courses an earlier version kept on this machine over once, when the backend has none', async () => {
    const backend = learningBackend()
    setKv('scriblr.training.enrolled', ['user-c1', 'nope'])
    await loadLearning()
    expect(Object.keys(getLearningData().training!.progress.enrolled)).toEqual(['user-c1'])
    expect(getKv('scriblr.training.enrolled')).toEqual([])
    __resetLearningForTests()
    await loadLearning()
    expect(backend.calls.filter(c => c.startsWith('PUT'))).toEqual(['PUT /training/enrolments/user-c1'])
  })

  it('does not carry them over when the backend has some, and still clears them', async () => {
    const backend = learningBackend(seedContent(), { ...emptyProgress(), enrolled: { 'admin-c1': 'x' } })
    setKv('scriblr.training.enrolled', ['user-c1'])
    await loadLearning()
    expect(Object.keys(getLearningData().training!.progress.enrolled)).toEqual(['admin-c1'])
    expect(backend.calls.filter(c => c.startsWith('PUT'))).toEqual([])
    expect(getKv('scriblr.training.enrolled')).toEqual([])
  })
})
