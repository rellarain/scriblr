import { NumberInput } from '../shared'

// A goal input: the actual count sits above it at the far right of the label,
// and a progress bar along the input's footer fills toward the goal.
export function GoalField({ label, current, goal, onChange }: {
  label: string
  current: number
  goal: number | null
  onChange: (value: number | null) => void
}) {
  const percent = goal && goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0
  return (
    <label className="wrGoal">
      <span className="wrGoalHead">
        <span>{label}</span>
        <span className="wrGoalCurrent" title="Current">{current.toLocaleString('en-US')}</span>
      </span>
      <span className="wrGoalInput">
        <NumberInput value={goal} onChange={onChange} />
        <span
          className="wrGoalBar" role="progressbar" aria-label={`${label} progress`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} title={`${percent}%`}
        >
          <span className="wrGoalFill" style={{ width: `${percent}%` }} />
        </span>
      </span>
    </label>
  )
}

export default GoalField
