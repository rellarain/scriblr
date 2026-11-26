import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ResourceContent, ResourceNode } from '../../api/types'
import { articleText } from '../../channels/articles'
import { useResourcesFile } from '../../channels/resourcesStore'
import { ChevronLeftIcon } from '../../assets/icons'
import { useLearning } from '../../assets/Interfaces/learning/learningStore'
import type { LinkTarget } from '../../lib/markup/links'
import CopyPlainText from './CopyPlainText'
import Markup from './Markup'
import { PlaceCtx, type Place } from './linkContext'
import './markup.scss'

// Where a link opens: in place (the same Help tile or lesson area), over what was there, with a Back button. What was there stays mounted
// (hidden), so its scroll and any half-answered question survive; the focus moves to Back and, on Back, returns to the link. A link to a
// heading of the same text scrolls to it.

function scrollToAnchor(within: Element | null, anchor: string | null) {
  if (!within || !anchor) return
  const heading = within.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(anchor)}"]`)
  if (!heading) return
  heading.setAttribute('tabindex', '-1')
  heading.scrollIntoView?.({ block: 'start' })
  heading.focus({ preventScroll: true })
}

// A Resources article: its node's name, then its guide, tutorials and FAQ, formatted, with Copy as plain text.
export function ArticleBody({ node, content, baseLevel = 4 }: { node: ResourceNode; content: ResourceContent; baseLevel?: number }) {
  const Title = `h${Math.min(6, baseLevel)}` as 'h4'
  return (
    <article className="wrHelpArticle">
      <div className="mkHead wrHelpHead"><Title>{node.name}</Title><CopyPlainText text={articleText(content)} label={`Copy ${node.name} as plain text`} /></div>
      {content.guide.trim() && <Markup text={content.guide} baseLevel={baseLevel} />}
      {content.tutorials.map(t => (
        <details key={t.id}><summary>{t.title || 'Tutorial'}</summary><Markup text={t.body} baseLevel={baseLevel + 1} /></details>
      ))}
      {content.faq.map(f => (
        <details key={f.id}><summary>{f.question}</summary><Markup text={f.answer} baseLevel={baseLevel + 1} /></details>
      ))}
    </article>
  )
}

function ArticleView({ nodeId }: { nodeId: string }) {
  const { file, ready } = useResourcesFile()
  const node = file?.nodes.find(n => n.id === nodeId)
  if (!node) return <p className="mkEmpty">{ready ? 'This article is not there any more.' : 'Loading…'}</p>
  const content = file?.content[nodeId]
  if (!content) return <article className="wrHelpArticle"><h4>{node.name}</h4><p className="mkEmpty">Nothing written here yet.</p></article>
  return <ArticleBody node={node} content={content} />
}

function LearningItemView({ id }: { id: string }) {
  const { training, status } = useLearning()
  const found = useMemo(() => {
    for (const course of training?.content.courses ?? []) {
      if (course.id === id) return { title: course.title, about: course.description, body: '' }
      for (const mod of course.modules) {
        if (mod.id === id) return { title: mod.title, about: mod.description, body: '' }
        for (const lesson of mod.lessons) if (lesson.id === id) return { title: lesson.title, about: lesson.description, body: lesson.body }
      }
    }
    return null
  }, [training, id])
  if (!found) return <p className="mkEmpty">{status === 'ready' ? 'This is not in Learning any more.' : 'Loading…'}</p>
  return (
    <article className="mkLearningItem">
      <div className="mkHead wrHelpHead"><h4>{found.title}</h4>{found.body.trim() && <CopyPlainText text={found.body} label={`Copy ${found.title} as plain text`} />}</div>
      {found.about.trim() && <Markup text={found.about} baseLevel={4} />}
      {found.body.trim() && <Markup text={found.body} baseLevel={4} />}
    </article>
  )
}

interface Entry { target: Exclude<LinkTarget, { kind: 'heading' }>; from: HTMLElement }

function Opened({ entry, shown, onBack }: { entry: Entry; shown: boolean; onBack: () => void }) {
  const view = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    back.current?.focus()
    // the target's text may still be loading: look for the heading once it is drawn
    const t = window.setTimeout(() => scrollToAnchor(view.current, entry.target.anchor), 0)
    return () => window.clearTimeout(t)
  }, [entry])
  return (
    <div ref={view} className="mkPlaceView" hidden={!shown}>
      <div className="mkPlaceBar">
        <button ref={back} type="button" className="mkIconBtn" aria-label="Back" title="Back" onClick={onBack}><ChevronLeftIcon size={16} /></button>
      </div>
      {entry.target.kind === 'article' ? <ArticleView nodeId={entry.target.nodeId} /> : <LearningItemView id={entry.target.id} />}
    </div>
  )
}

export function MarkupPlace({ children, className }: { children: ReactNode; className?: string }) {
  const [stack, setStack] = useState<Entry[]>([])
  const root = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const place = useMemo<Place>(() => ({
    open: (target, from) => {
      if (target.kind === 'heading') {
        scrollToAnchor(from.closest('.mkPlaceView') ?? root.current, target.anchor)
        return
      }
      setStack(s => [...s, { target, from }])
    },
  }), [])
  useLayoutEffect(() => {
    const el = returnTo.current
    if (el && el.isConnected) el.focus()
    returnTo.current = null
  }, [stack])
  const goBack = () => {
    returnTo.current = stack[stack.length - 1]?.from ?? null
    setStack(s => s.slice(0, -1))
  }
  return (
    <PlaceCtx.Provider value={place}>
      <div ref={root} className={`mkPlace${className ? ` ${className}` : ''}`}>
        <div className="mkPlaceView" hidden={stack.length > 0}>{children}</div>
        {stack.map((entry, k) => <Opened key={k} entry={entry} shown={k === stack.length - 1} onBack={goBack} />)}
      </div>
    </PlaceCtx.Provider>
  )
}

export default MarkupPlace
