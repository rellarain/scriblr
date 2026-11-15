import { MyFeedbackList } from '../../../feedback/MyFeedback'
import { loadMine, useMine } from '../../../feedback/mineStore'
import '../../../feedback/feedback.scss'

// User > Dashboard > Notifications: the questions staff asked about your feedback (answer them here), then everything you sent
// with where it stands now (received, checked, in voting, planned, in progress, done or declined with the reason).
export default function UserNotifications() {
  const { view, status, error } = useMine()
  const asking = view.messages.filter(m => m.questions.some(q => !q.answer))
  const rest = view.messages.filter(m => !asking.includes(m))
  return (
    <div className="fbPage fbScope">
      {status === 'error' && (
        <p className="fbError" role="alert">{error} <button type="button" className="fbIconBtn" onClick={() => void loadMine()}>Retry</button></p>
      )}
      {asking.length > 0 && (
        <section className="fbList" aria-label="Questions for you">
          <h3 className="fbLabel">Questions for you ({asking.length})</h3>
          <MyFeedbackList messages={asking} empty="" />
        </section>
      )}
      <section className="fbList" aria-label="Your feedback">
        <h3 className="fbLabel">Your feedback</h3>
        <MyFeedbackList messages={rest} empty={status === 'loading' || status === 'idle' ? 'Loading…' : 'Nothing sent yet.'} />
      </section>
    </div>
  )
}
