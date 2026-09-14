import type { FeedbackItem, Tone } from '../helperTypes'
import { FrownIcon, ToningIcon } from '../../../icons'
import { ToneStatusIcon, combineTone, isPleasant, isUnpleasant } from './inboxHelpers'

interface ToneTabProps {
  items: FeedbackItem[]
  onSetTone: (itemId: string, tone: Tone) => void
}

function ToneTab({ items, onSetTone }: ToneTabProps) {
  const sorted = [...items].sort((a, b) => (a.tone ? 1 : 0) - (b.tone ? 1 : 0))

  return (
    <div className="feedbackList">
      {sorted.map(item => {
        const pleasant = isPleasant(item.tone)
        const unpleasant = isUnpleasant(item.tone)
        return (
          <div key={item.id} className={item.tone ? 'feedbackCard' : 'feedbackCard feedbackCard--pending'}>
            <span className="feedbackCardStatus"><ToneStatusIcon tone={item.tone} /></span>
            <p className="senderToneBadge">
              <ToneStatusIcon tone={item.senderTone} size={14} /> Sender self-identified: {item.senderTone ?? 'unspecified'}
            </p>
            <p className="feedbackCardText">&ldquo;{item.text}&rdquo;</p>
            <p className="feedbackCardMeta">{item.author} · {item.submittedAt}</p>
            <div className="toneRow">
              <button
                type="button"
                className={pleasant ? 'toneBtn toneBtn--active' : 'toneBtn'}
                onClick={() => onSetTone(item.id, combineTone(!pleasant, unpleasant))}
              >
                <ToningIcon size={14} /> Pleasant
              </button>
              <button
                type="button"
                className={unpleasant ? 'toneBtn toneBtn--active' : 'toneBtn'}
                onClick={() => onSetTone(item.id, combineTone(pleasant, !unpleasant))}
              >
                <FrownIcon size={14} /> Unpleasant
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ToneTab
