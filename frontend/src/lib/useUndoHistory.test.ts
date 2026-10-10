import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TEXT_MERGE_MS, UndoStack, useUndoHistory } from './useUndoHistory'

describe('UndoStack', () => {
  it('undoes and redoes one structural edit at a time', () => {
    const s = new UndoStack<string>()
    s.reset('a')
    s.record('b')
    s.record('c')
    expect(s.canUndo).toBe(true)
    expect(s.undo()).toBe('b')
    expect(s.canRedo).toBe(true)
    expect(s.undo()).toBe('a')
    expect(s.canUndo).toBe(false)
    expect(s.undo()).toBeUndefined()
    expect(s.redo()).toBe('b')
    expect(s.redo()).toBe('c')
    expect(s.redo()).toBeUndefined()
  })

  it('a new edit empties the redo steps', () => {
    const s = new UndoStack<string>()
    s.reset('a')
    s.record('b')
    s.undo()
    expect(s.canRedo).toBe(true)
    s.record('c')
    expect(s.canRedo).toBe(false)
    expect(s.undo()).toBe('a')
  })

  it('merges a burst of text edits into one step, but not across a pause', () => {
    const s = new UndoStack<string>()
    s.reset('')
    s.record('a', { text: true, now: 0 })
    s.record('ab', { text: true, now: 300 })
    s.record('abc', { text: true, now: 300 + TEXT_MERGE_MS - 1 })
    s.record('abcd', { text: true, now: 5000 + TEXT_MERGE_MS }) // after a pause: a new step
    expect(s.undo()).toBe('abc')
    expect(s.undo()).toBe('')
    expect(s.undo()).toBeUndefined()
  })

  it('does not merge a text edit with a structural one, or across a save', () => {
    const s = new UndoStack<string>()
    s.reset('')
    s.record('x', { now: 0 })
    s.record('xy', { text: true, now: 10 })
    s.record('xyz', { text: true, now: 20 })
    s.markSaved()
    s.record('xyzw', { text: true, now: 30 }) // a save landed in between
    expect(s.undo()).toBe('xyz')
    expect(s.undo()).toBe('x')
    expect(s.undo()).toBe('')
  })

  it('stepBack goes past what the history holds and can be redone', () => {
    const s = new UndoStack<string>()
    s.reset('now')
    expect(s.canUndo).toBe(false)
    s.stepBack('earlier') // from today's activity log
    expect(s.current).toBe('earlier')
    expect(s.canRedo).toBe(true)
    expect(s.redo()).toBe('now')
  })

  it('clear forgets everything', () => {
    const s = new UndoStack<string>()
    s.reset('a')
    s.record('b')
    s.undo()
    s.clear()
    expect(s.canUndo).toBe(false)
    expect(s.canRedo).toBe(false)
    expect(s.undo()).toBeUndefined()
  })

  it('the first record without a baseline becomes the baseline', () => {
    const s = new UndoStack<string>()
    s.record('only')
    expect(s.canUndo).toBe(false)
    expect(s.current).toBe('only')
  })
})

describe('useUndoHistory', () => {
  it('reports canUndo and canRedo as they change', () => {
    const { result } = renderHook(() => useUndoHistory<number>())
    expect(result.current.canUndo).toBe(false)
    act(() => { result.current.reset(0); result.current.record(1) })
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
    let v: number | undefined
    act(() => { v = result.current.undo() })
    expect(v).toBe(0)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)
    act(() => { result.current.record(5) })
    expect(result.current.canRedo).toBe(false)
    act(() => { result.current.clear() })
    expect(result.current.canUndo).toBe(false)
  })
})
