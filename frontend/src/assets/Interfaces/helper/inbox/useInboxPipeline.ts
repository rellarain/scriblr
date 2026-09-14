import { useMemo, useState } from 'react'
import type { ChannelTag, Tone } from '../helperTypes'
import { SEED_ITEMS, SEED_STATEMENTS } from './inboxSeed'
import { TONE_ORDER, sameChannelTag } from './inboxHelpers'

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function useInboxPipeline() {
  const [items, setItems] = useState(SEED_ITEMS)
  const [statements, setStatements] = useState(SEED_STATEMENTS)
  const [toneProcessingOrder, setToneProcessingOrder] = useState<Tone[]>(TONE_ORDER)

  // Tone — the admin's secondary identification, layered on top of each
  // item's sender-self-identified senderTone (read-only, set only at seed).
  function setTone(itemId: string, tone: Tone) {
    setItems(prev => prev.map(i => (i.id === itemId ? { ...i, tone } : i)))
  }

  // Sorting
  function addChannelTag(itemId: string, tag: ChannelTag) {
    setItems(prev => prev.map(i => (i.id === itemId ? { ...i, channels: [...i.channels, tag] } : i)))
  }
  function removeChannelTag(itemId: string, index: number) {
    setItems(prev => prev.map(i => (i.id === itemId ? { ...i, channels: i.channels.filter((_, idx) => idx !== index) } : i)))
  }
  function moveTonePriority(tone: Tone, direction: 'up' | 'down') {
    setToneProcessingOrder(prev => {
      const index = prev.indexOf(tone)
      const swapWith = direction === 'up' ? index - 1 : index + 1
      if (swapWith < 0 || swapWith >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
      return next
    })
  }

  // Explicate — one Statement per (subject, verb) pair; a subject can get
  // multiple verbs, each its own Statement.
  function addStatement(feedbackId: string, subject: ChannelTag, verb: string) {
    setStatements(prev => [...prev, { id: newId('st'), feedbackId, subject, verb }])
  }
  function updateStatement(statementId: string, verb: string) {
    setStatements(prev => prev.map(s => (s.id === statementId ? { ...s, verb } : s)))
  }
  function removeStatement(statementId: string) {
    setStatements(prev => prev.filter(s => s.id !== statementId))
  }

  // Derived queues — used by both the tab UIs and the tab-strip counts.
  const untoned = useMemo(() => items.filter(i => !i.tone), [items])
  const unchanneled = useMemo(() => items.filter(i => i.channels.length === 0), [items])

  const subjects = useMemo(
    () => items.flatMap(i => i.channels.map(tag => ({ feedbackId: i.id, tag }))),
    [items],
  )
  const unexplicatedSubjects = useMemo(
    () => subjects.filter(subj => !statements.some(s => s.feedbackId === subj.feedbackId && sameChannelTag(s.subject, subj.tag))),
    [subjects, statements],
  )

  return {
    items, statements, toneProcessingOrder,
    setTone, addChannelTag, removeChannelTag, moveTonePriority,
    addStatement, updateStatement, removeStatement,
    untoned, unchanneled, subjects, unexplicatedSubjects,
  }
}

export type InboxPipeline = ReturnType<typeof useInboxPipeline>
