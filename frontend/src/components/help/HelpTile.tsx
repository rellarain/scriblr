import { useState, type ComponentType, type ReactNode } from 'react'
import { BookOpenIcon, EnvelopeIcon, ListIcon, type IconProps } from '../../assets/icons'
import HelpArticles from '../../assets/Interfaces/writer/levels/HelpArticles'
import { useChannels } from '../../channels/channelStore'
import { nearest } from '../../channels/channelTree'
import type { HelpTarget } from '../../channels/helpTargets'
import ChannelPicker from '../../feedback/ChannelPicker'
import { MyFeedbackList } from '../../feedback/MyFeedback'
import { FeelingPicker } from '../../feedback/ToneFaces'
import type { Tone } from '../../feedback/feedbackTypes'
import { sendFeedback, useMine } from '../../feedback/mineStore'
import '../../feedback/feedback.scss'
import './help.scss'

// The Help tile of a console (every interface has one): its guides (Resources, by its channel id), a form to send feedback
// as a statement (what it is about, a verb, the words, and a smile, a frown, both or neither), and the feedback you sent with where each stands
// and the questions asked of you. Where you were is sent with the feedback.

type Section = 'guides' | 'send' | 'mine'
const SECTIONS: Array<{ key: Section; label: string; Icon: ComponentType<IconProps> }> = [
  { key: 'guides', label: 'Guides', Icon: BookOpenIcon },
  { key: 'send', label: 'Send feedback', Icon: EnvelopeIcon },
  { key: 'mine', label: 'My feedback', Icon: ListIcon },
]

function SendFeedback({ target, onSent }: { target: HelpTarget; onSent: () => void }) {
  const { index } = useChannels()
  const { verbs, error } = useMine()
  const start = nearest(index, target.id)?.id ?? null
  const [subject, setSubject] = useState<string | null>(null)
  const [verb, setVerb] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [tone, setTone] = useState<Tone | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const at = subject ?? start
  const ready = !!at && !!verb && text.trim() !== '' && !busy

  const send = async () => {
    if (!ready || !at || !verb) return
    setBusy(true)
    const ok = await sendFeedback({ text, senderTone: tone, channelId: at, verbId: verb, fromChannel: start })
    setBusy(false)
    if (ok) { setText(''); setVerb(null); setTone(null); setSubject(null); setSent(true); onSent() }
  }

  return (
    <form className="helpForm" aria-label="Send feedback" onSubmit={e => { e.preventDefault(); void send() }}>
      <span className="fbLabel" id="help-about">What it is about</span>
      <ChannelPicker value={at} onChange={id => { setSubject(id); setSent(false) }} label="What it is about" />
      <span className="fbLabel" id="help-verb">What should happen</span>
      <div className="fbVerbs" role="group" aria-labelledby="help-verb">
        {verbs.map(v => (
          <button key={v.id} type="button" className="fbVerbChip" aria-pressed={verb === v.id} onClick={() => { setVerb(verb === v.id ? null : v.id); setSent(false) }}>
            {v.name}
          </button>
        ))}
      </div>
      <textarea
        className="fbField" value={text} maxLength={2000} aria-label="Your feedback" placeholder="Tell us more…"
        onChange={e => { setText(e.target.value); setSent(false) }}
      />
      <span className="fbLabel">How you feel about it</span>
      <FeelingPicker value={tone} onChange={setTone} label="How you feel about it" />
      <div className="fbRow">
        <button type="submit" className="fbIconBtn fbIconBtn--primary" disabled={!ready} aria-label="Send feedback" title="Send feedback">
          <EnvelopeIcon size={14} /> Send
        </button>
        {sent && <span role="status" className="fbMuted">Sent. It is under My feedback.</span>}
      </div>
      {error && <p className="fbError" role="alert">{error}</p>}
    </form>
  )
}

export default function HelpTile({ target, fallback }: { target: HelpTarget; fallback: ReactNode }) {
  const [section, setSection] = useState<Section>('guides')
  const { view } = useMine()
  return (
    <div className="helpTile fbScope">
      <div className="helpTabs" role="tablist" aria-label="Help">
        {SECTIONS.map(({ key, label, Icon }) => (
          <button
            key={key} type="button" role="tab" id={`help-tab-${key}`} aria-selected={section === key} aria-controls={`help-panel-${key}`}
            className="helpTab" aria-label={label} title={label} onClick={() => setSection(key)}
          >
            <Icon size={16} />
            {key === 'mine' && view.openQuestions > 0 && <span className="helpBadge" aria-label={`${view.openQuestions} questions for you`}>{view.openQuestions}</span>}
          </button>
        ))}
      </div>
      <div className="helpBody" role="tabpanel" id={`help-panel-${section}`} aria-labelledby={`help-tab-${section}`}>
        {section === 'guides' && <HelpArticles target={target} fallback={fallback} />}
        {section === 'send' && <SendFeedback target={target} onSent={() => undefined} />}
        {section === 'mine' && <MyFeedbackList messages={view.messages} empty="Nothing sent yet." />}
      </div>
    </div>
  )
}
