import { useEffect, useRef, useState } from 'react'
import { useWriterWorkspace, type TransitionState } from './writer/useWriterWorkspace'
import BookLayer from './writer/BookLayer'
import ShelfLayer from './writer/ShelfLayer'
import WuiSidebar from './writer/WuiSidebar'

const TRANSITION_MS = 600

// Three stacked layers per scrilbrPlan.md's "Writer Page (WUI)" section:
// bookContainer (book/chapter editing, bottom) -> bookshelfContainer
// (project shelf + shelf console drawer, middle) -> wuiSidebar (all
// navigation, topmost, always 1 column wide). WuiSidebar is the only place
// navigation happens now, so the sliderPages transition it can trigger
// (opening a book into a chapter, flipping draft<->preview) is owned here,
// one level up, since BookLayer (who renders the transition) and
// WuiSidebar (who triggers it) are siblings with no other shared parent.
function WUI() {
  const workspace = useWriterWorkspace()
  const [transitionState, setTransitionState] = useState<TransitionState>('idle')
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current) }, [])

  function onNavigate(kind: 'opening' | 'flipping' | null, after: () => void) {
    if (!kind) { after(); return }
    setTransitionState(kind)
    transitionTimerRef.current = setTimeout(() => {
      after()
      setTransitionState('idle')
    }, TRANSITION_MS)
  }

  return (
    <main className="wUI">
      <BookLayer workspace={workspace} transitionState={transitionState} />
      <ShelfLayer workspace={workspace} />
      <WuiSidebar workspace={workspace} onNavigate={onNavigate} />
    </main>
  )
}

export default WUI
