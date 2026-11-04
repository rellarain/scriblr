import { describe, expect, it } from 'vitest'
import { getKv, setKv } from '../../../settings/settingsStore'
import { emptyProgress, seedContent, trainingBackend } from '../../../test/trainingBackend'
import { __resetTrainingForTests, adoptTraining, enrol, getTrainingData, leave, loadTraining, recordAttempt, saveContent, setCompleted } from './trainingStore'

describe('the Training store', () => {
  it('starts idle, loads once (calls in flight share one request) and keeps what it loaded', async () => {
    const backend = trainingBackend()
    expect(getTrainingData().status).toBe('idle')
    const first = loadTraining()
    expect(getTrainingData().status).toBe('loading')
    await Promise.all([first, loadTraining()])
    expect(getTrainingData().status).toBe('ready')
    expect(getTrainingData().training?.content.curricula).toHaveLength(5)
    await loadTraining()
    expect(backend.calls.filter(c => c === 'GET /training')).toHaveLength(1)
    await loadTraining(true)
    expect(backend.calls.filter(c => c === 'GET /training')).toHaveLength(2)
  })

  it('says what went wrong when it cannot load, and loads when asked again', async () => {
    const backend = trainingBackend()
    backend.failNext('/training', 409, 'shard corrupt and quarantined')
    await loadTraining()
    expect(getTrainingData()).toMatchObject({ status: 'error', error: 'shard corrupt and quarantined', training: null })
    await loadTraining(true)
    expect(getTrainingData().status).toBe('ready')
    expect(getTrainingData().error).toBeNull()
  })

  it('adopts a state handed to it, as ready, clearing an error', async () => {
    const backend = trainingBackend()
    backend.failNext('/training', 500, 'down')
    await loadTraining()
    expect(getTrainingData().status).toBe('error')
    adoptTraining({ content: seedContent(), progress: emptyProgress() })
    expect(getTrainingData()).toMatchObject({ status: 'ready', error: null, actionError: null })
    expect(getTrainingData().training?.content.curricula).toHaveLength(5)
  })

  it('takes the state each action answers with: enrol, leave, mark complete and not, and a result', async () => {
    trainingBackend()
    await loadTraining()
    await enrol('writer-c1')
    expect(Object.keys(getTrainingData().training!.progress.enrolled)).toEqual(['writer-c1'])
    await setCompleted('writer-c1-m1', true)
    expect(Object.keys(getTrainingData().training!.progress.completed)).toEqual(['writer-c1-m1'])
    await setCompleted('writer-c1-m1', false)
    expect(getTrainingData().training!.progress.completed).toEqual({})
    await recordAttempt('writer-c1-m1-l1-q1', 80)
    const progress = getTrainingData().training!.progress
    expect(progress.attempts['writer-c1-m1-l1-q1'][0]).toMatchObject({ score: 80, passed: true })
    expect(Object.keys(progress.completed)).toEqual(['writer-c1-m1-l1'])
    await leave('writer-c1')
    expect(getTrainingData().training!.progress.enrolled).toEqual({})
  })

  it('keeps the state it had, and says why, when an action fails (and forgets it after one that works)', async () => {
    const backend = trainingBackend()
    await loadTraining()
    backend.failNext('/training/enrolments/writer-c1', 500, 'Nope.')
    await enrol('writer-c1')
    expect(getTrainingData().actionError).toBe('Nope.')
    expect(getTrainingData().training!.progress.enrolled).toEqual({})
    await enrol('writer-c1')
    expect(getTrainingData().actionError).toBeNull()
    expect(Object.keys(getTrainingData().training!.progress.enrolled)).toEqual(['writer-c1'])
  })

  it('saves the courses, which drops the progress of what is gone', async () => {
    trainingBackend()
    await loadTraining()
    await enrol('reader-c1')
    await enrol('writer-c1')
    const { curricula, courses } = getTrainingData().training!.content
    await saveContent({ curricula: curricula.map(c => ({ ...c, courseIds: c.courseIds.filter(id => id !== 'reader-c1') })), courses: courses.filter(c => c.id !== 'reader-c1') })
    expect(getTrainingData().training!.content.courses.map(c => c.id)).not.toContain('reader-c1')
    expect(Object.keys(getTrainingData().training!.progress.enrolled)).toEqual(['writer-c1'])
  })

  it('carries the courses an earlier version kept on this machine over once, when the backend has none', async () => {
    const backend = trainingBackend()
    setKv('scriblr.training.enrolled', ['user-c1', 'nope'])
    await loadTraining()
    expect(Object.keys(getTrainingData().training!.progress.enrolled)).toEqual(['user-c1'])
    expect(getKv('scriblr.training.enrolled')).toEqual([])
    __resetTrainingForTests()
    await loadTraining()
    expect(backend.calls.filter(c => c.startsWith('PUT'))).toEqual(['PUT /training/enrolments/user-c1'])
  })

  it('does not carry them over when the backend has some, and still clears them', async () => {
    const backend = trainingBackend(seedContent(), { ...emptyProgress(), enrolled: { 'admin-c1': 'x' } })
    setKv('scriblr.training.enrolled', ['user-c1'])
    await loadTraining()
    expect(Object.keys(getTrainingData().training!.progress.enrolled)).toEqual(['admin-c1'])
    expect(backend.calls.filter(c => c.startsWith('PUT'))).toEqual([])
    expect(getKv('scriblr.training.enrolled')).toEqual([])
  })
})
