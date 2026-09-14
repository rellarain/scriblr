import { useState } from 'react'
import type { ChannelTag, FeedbackItem, Tone } from '../helperTypes'
import { CHANNEL_TAXONOMY } from '../helperTypes'
import { ToneStatusIcon, rankTone } from './inboxHelpers'

interface SortingTabProps {
  items: FeedbackItem[]
  onAddChannelTag: (itemId: string, tag: ChannelTag) => void
  onRemoveChannelTag: (itemId: string, index: number) => void
  toneProcessingOrder: Tone[]
  onMoveTonePriority: (tone: Tone, direction: 'up' | 'down') => void
}

const TONE_LABELS: Record<Tone, string> = {
  pleasant: 'Pleasant', unpleasant: 'Unpleasant', mixed: 'Mixed', neutral: 'Neutral',
}

function TonePriorityList({ order, onMove }: { order: Tone[]; onMove: (tone: Tone, direction: 'up' | 'down') => void }) {
  return (
    <div className="tonePriorityList">
      {order.map((tone, index) => (
        <div key={tone} className="tonePriorityRow">
          <span className="tonePriorityLabel"><ToneStatusIcon tone={tone} size={16} /> {TONE_LABELS[tone]}</span>
          <div>
            <button type="button" className="tonePriorityMoveBtn" disabled={index === 0} onClick={() => onMove(tone, 'up')}>▲</button>
            <button type="button" className="tonePriorityMoveBtn" disabled={index === order.length - 1} onClick={() => onMove(tone, 'down')}>▼</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function SortingCard({ item, onAdd, onRemove }: {
  item: FeedbackItem
  onAdd: (tag: ChannelTag) => void
  onRemove: (index: number) => void
}) {
  const initialPage = item.openPage && CHANNEL_TAXONOMY.some(p => p.name === item.openPage) ? item.openPage : ''
  const initialPageDef = CHANNEL_TAXONOMY.find(p => p.name === initialPage)
  const initialComponent = item.selectedComponent && initialPageDef?.components.some(c => c.name === item.selectedComponent)
    ? item.selectedComponent
    : ''

  const [page, setPage] = useState(initialPage)
  const [component, setComponent] = useState(initialComponent)
  const [feature, setFeature] = useState('')

  const pageDef = CHANNEL_TAXONOMY.find(p => p.name === page)
  const componentDef = pageDef?.components.find(c => c.name === component)

  function handleAdd() {
    if (!page || !component || !feature) return
    onAdd({ page, component, feature })
    setPage(''); setComponent(''); setFeature('')
  }

  return (
    <div className={item.channels.length === 0 ? 'feedbackCard feedbackCard--pending' : 'feedbackCard'}>
      <p className="feedbackCardText">&ldquo;{item.text}&rdquo;</p>
      <p className="feedbackCardMeta">{item.author} · {item.submittedAt}</p>
      <div className="channelPillRow">
        {item.channels.map((tag, index) => (
          <span key={`${tag.page}-${tag.component}-${tag.feature}-${index}`} className="channelPill">
            {tag.page} &gt; {tag.component} &gt; {tag.feature}
            <span className="channelPillRemove" onClick={() => onRemove(index)}>×</span>
          </span>
        ))}
      </div>
      <div className="channelAddForm">
        <select value={page} onChange={e => { setPage(e.target.value); setComponent(''); setFeature('') }}>
          <option value="">Page…</option>
          {CHANNEL_TAXONOMY.map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        <select value={component} disabled={!pageDef} onChange={e => { setComponent(e.target.value); setFeature('') }}>
          <option value="">Component…</option>
          {pageDef?.components.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select value={feature} disabled={!componentDef} onChange={e => setFeature(e.target.value)}>
          <option value="">Feature…</option>
          {componentDef?.features.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <button type="button" className="toneBtn" disabled={!feature} onClick={handleAdd}>Add</button>
      </div>
    </div>
  )
}

function SortingTab({ items, onAddChannelTag, onRemoveChannelTag, toneProcessingOrder, onMoveTonePriority }: SortingTabProps) {
  const groups = new Map<string, FeedbackItem[]>()
  for (const item of items) {
    const key = `${item.senderTone ?? ''}|${item.tone ?? ''}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(item)
    else groups.set(key, [item])
  }

  const groupKeys = Array.from(groups.keys()).sort((a, b) => {
    const [aSender, aAdmin] = a.split('|') as [Tone | '', Tone | '']
    const [bSender, bAdmin] = b.split('|') as [Tone | '', Tone | '']
    const aRank = rankTone(toneProcessingOrder, aSender || undefined) * 10 + rankTone(toneProcessingOrder, aAdmin || undefined)
    const bRank = rankTone(toneProcessingOrder, bSender || undefined) * 10 + rankTone(toneProcessingOrder, bAdmin || undefined)
    return aRank - bRank
  })

  return (
    <div>
      <TonePriorityList order={toneProcessingOrder} onMove={onMoveTonePriority} />
      {groupKeys.map(key => {
        const [senderKey, adminKey] = key.split('|')
        const groupItems = [...groups.get(key)!].sort((a, b) => a.channels.length - b.channels.length)
        return (
          <div key={key} className="implementGroup">
            <h3 className="implementGroupHeader">
              Sender: {senderKey || 'unspecified'} · Admin: {adminKey || 'unset'} ({groupItems.length})
            </h3>
            <div className="feedbackList">
              {groupItems.map(item => (
                <SortingCard
                  key={item.id} item={item}
                  onAdd={tag => onAddChannelTag(item.id, tag)}
                  onRemove={index => onRemoveChannelTag(item.id, index)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default SortingTab
