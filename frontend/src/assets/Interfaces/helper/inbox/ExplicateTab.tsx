import { useState } from 'react'
import type { ChannelTag, FeedbackItem, Statement } from '../helperTypes'
import { CHANNEL_TAXONOMY } from '../helperTypes'
import { TONE_ORDER, channelTagLabel, rankTone, sameChannelTag } from './inboxHelpers'

interface Subject { feedbackId: string; tag: ChannelTag }

interface ExplicateTabProps {
  subjects: Subject[]
  items: FeedbackItem[]
  statements: Statement[]
  onAddStatement: (feedbackId: string, subject: ChannelTag, verb: string) => void
  onUpdateStatement: (statementId: string, verb: string) => void
  onRemoveStatement: (statementId: string) => void
}

type SortKey = 'tone' | 'page' | 'component' | 'feature'

function pageIndex(name: string) {
  return CHANNEL_TAXONOMY.findIndex(p => p.name === name)
}
function componentIndex(pageName: string, name: string) {
  const page = CHANNEL_TAXONOMY.find(p => p.name === pageName)
  return page ? page.components.findIndex(c => c.name === name) : -1
}
function featureIndex(pageName: string, componentName: string, name: string) {
  const page = CHANNEL_TAXONOMY.find(p => p.name === pageName)
  const component = page?.components.find(c => c.name === componentName)
  return component ? component.features.indexOf(name) : -1
}

function SubjectCard({ subject, item, statements, onAddStatement, onUpdateStatement, onRemoveStatement }: {
  subject: Subject
  item: FeedbackItem
  statements: Statement[]
  onAddStatement: ExplicateTabProps['onAddStatement']
  onUpdateStatement: ExplicateTabProps['onUpdateStatement']
  onRemoveStatement: ExplicateTabProps['onRemoveStatement']
}) {
  const [verb, setVerb] = useState('')

  function handleAdd() {
    if (!verb.trim()) return
    onAddStatement(subject.feedbackId, subject.tag, verb.trim())
    setVerb('')
  }

  return (
    <div className="explicatePane">
      <div className="explicateSource feedbackCard">
        <p className="feedbackCardText">&ldquo;{item.text}&rdquo;</p>
        <p className="feedbackCardMeta">{item.author} · {item.submittedAt}</p>
        <span className="channelPill">{channelTagLabel(subject.tag)}</span>
      </div>
      <div className="explicateStatements">
        {statements.map(s => (
          <div key={s.id} className="statementRow">
            <input
              className="statementField" value={s.verb} placeholder="intention verb"
              onChange={e => onUpdateStatement(s.id, e.target.value)}
            />
            <button type="button" className="statementRemoveBtn" onClick={() => onRemoveStatement(s.id)}>×</button>
          </div>
        ))}
        <div className="statementRow">
          <input
            className="statementField" value={verb} placeholder="Add intention verb…"
            onChange={e => setVerb(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button type="button" className="addStatementBtn toneBtn" onClick={handleAdd}>+ Add</button>
        </div>
      </div>
    </div>
  )
}

function ExplicateTab({ subjects, items, statements, onAddStatement, onUpdateStatement, onRemoveStatement }: ExplicateTabProps) {
  const [sortKey, setSortKey] = useState<SortKey>('page')

  const sorted = [...subjects].sort((a, b) => {
    if (sortKey === 'tone') {
      const itemA = items.find(i => i.id === a.feedbackId)
      const itemB = items.find(i => i.id === b.feedbackId)
      return rankTone(TONE_ORDER, itemA?.senderTone) - rankTone(TONE_ORDER, itemB?.senderTone)
    }
    if (sortKey === 'page') return pageIndex(a.tag.page) - pageIndex(b.tag.page)
    if (sortKey === 'component') return componentIndex(a.tag.page, a.tag.component) - componentIndex(b.tag.page, b.tag.component)
    return featureIndex(a.tag.page, a.tag.component, a.tag.feature) - featureIndex(b.tag.page, b.tag.component, b.tag.feature)
  })

  return (
    <div>
      <div className="channelAddForm">
        <label>
          Sort by{' '}
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
            <option value="tone">Tone</option>
            <option value="page">Page</option>
            <option value="component">Component</option>
            <option value="feature">Feature</option>
          </select>
        </label>
      </div>
      {sorted.map((subject, index) => {
        const item = items.find(i => i.id === subject.feedbackId)
        if (!item) return null
        return (
          <SubjectCard
            key={`${subject.feedbackId}-${subject.tag.page}-${subject.tag.component}-${subject.tag.feature}-${index}`}
            subject={subject} item={item}
            statements={statements.filter(s => s.feedbackId === subject.feedbackId && sameChannelTag(s.subject, subject.tag))}
            onAddStatement={onAddStatement}
            onUpdateStatement={onUpdateStatement}
            onRemoveStatement={onRemoveStatement}
          />
        )
      })}
    </div>
  )
}

export default ExplicateTab
