import { useCallback, useMemo, useRef, useState } from 'react'

// An undo history for one document (a whole value: the outline, the plot, the project's settings, a chapter's draft).
//
//  - reset(value): the document as loaded or last restored; clears both stacks.
//  - record(value, { text }): a committed edit. A structural edit is one step; a text edit merges with the previous text edit
//    when it follows within TEXT_MERGE_MS (so a burst of typing is one step), but never across a save.
//  - markSaved(): a save landed, so the next edit starts a new step.
//  - undo() / redo(): move one step and return the value to show (undefined when there is nothing to move to). The caller applies it
//    without recording it. A new edit empties the redo stack.
//  - stepBack(value): an undo into something older than this history holds (today's activity log): the current value becomes a
//    redo step and `value` the present one.
//  - clear(): leave the page: nothing to undo or redo from memory any more.
//
// Values are kept by reference, never copied, so they must not be mutated afterwards (the editors replace, never mutate).
export const TEXT_MERGE_MS = 1000

export class UndoStack<T> {
  private past: T[] = []
  private future: T[] = []
  private present: T | undefined
  private hasPresent = false
  private lastTextAt = 0
  private lastWasText = false
  private boundary = true

  reset(value: T): void {
    this.past = []
    this.future = []
    this.present = value
    this.hasPresent = true
    this.lastWasText = false
    this.boundary = true
  }

  record(value: T, opts: { text?: boolean; now?: number } = {}): void {
    const now = opts.now ?? Date.now()
    if (!this.hasPresent) { this.reset(value); return }
    this.future = []
    const merge = opts.text === true && this.lastWasText && !this.boundary && now - this.lastTextAt < TEXT_MERGE_MS
    if (!merge) this.past.push(this.present as T)
    this.present = value
    this.lastWasText = opts.text === true
    this.lastTextAt = now
    this.boundary = false
  }

  markSaved(): void { this.boundary = true }

  // The present value changed without being a step (a setting that is not part of the history).
  replace(value: T): void {
    this.present = value
    this.hasPresent = true
  }

  undo(): T | undefined {
    if (this.past.length === 0 || !this.hasPresent) return undefined
    this.future.push(this.present as T)
    this.present = this.past.pop() as T
    this.boundary = true
    return this.present
  }

  redo(): T | undefined {
    if (this.future.length === 0) return undefined
    this.past.push(this.present as T)
    this.present = this.future.pop() as T
    this.boundary = true
    return this.present
  }

  stepBack(value: T): void {
    if (this.hasPresent) this.future.push(this.present as T)
    this.present = value
    this.hasPresent = true
    this.boundary = true
  }

  clear(): void {
    this.past = []
    this.future = []
    this.hasPresent = false
    this.present = undefined
    this.lastWasText = false
    this.boundary = true
  }

  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }
  get current(): T | undefined { return this.present }
  get hasBaseline(): boolean { return this.hasPresent }
}

export interface UndoHistory<T> {
  reset: (value: T) => void
  record: (value: T, opts?: { text?: boolean }) => void
  markSaved: () => void
  undo: () => T | undefined
  redo: () => T | undefined
  stepBack: (value: T) => void
  clear: () => void
  canUndo: boolean
  canRedo: boolean
}

// The stack as a hook: the buttons re-render when what can be undone or redone changes.
export function useUndoHistory<T>(): UndoHistory<T> {
  const stack = useRef<UndoStack<T> | null>(null)
  if (stack.current === null) stack.current = new UndoStack<T>()
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false })
  const sync = useCallback(() => {
    const s = stack.current as UndoStack<T>
    setFlags(prev => (prev.canUndo === s.canUndo && prev.canRedo === s.canRedo ? prev : { canUndo: s.canUndo, canRedo: s.canRedo }))
  }, [])

  return useMemo(() => {
    const s = () => stack.current as UndoStack<T>
    return {
      reset: (value: T) => { s().reset(value); sync() },
      record: (value: T, opts?: { text?: boolean }) => { s().record(value, opts); sync() },
      markSaved: () => { s().markSaved() },
      undo: () => { const v = s().undo(); sync(); return v },
      redo: () => { const v = s().redo(); sync(); return v },
      stepBack: (value: T) => { s().stepBack(value); sync() },
      clear: () => { s().clear(); sync() },
      canUndo: flags.canUndo,
      canRedo: flags.canRedo,
    }
  }, [sync, flags.canUndo, flags.canRedo])
}
