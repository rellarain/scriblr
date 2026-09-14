import { useState } from 'react'
import type { HelperUserProfile } from './helperTypes'

interface ProfileHeaderProps {
  profile?: HelperUserProfile
}

function ProfileHeader({ profile }: ProfileHeaderProps) {
  const [expanded, setExpanded] = useState(true)

  if (!profile) return null

  return (
    <div className="helperProfileHeader feedbackCard">
      <button
        type="button" className="helperProfileHeaderBtn customizeGroupHeader"
        aria-expanded={expanded} onClick={() => setExpanded(v => !v)}
      >
        <span>{profile.name} · {profile.status}</span>
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="helperProfileBody">
          <p className="feedbackCardMeta">
            Currently writing: {profile.currentProjectTitle}
            {profile.currentBookTitle && ` — ${profile.currentBookTitle}`}
          </p>
          <div className="helperProfileStatRow">
            <span className="helperProfileStat">{profile.activity.wordCountTotal.toLocaleString()} words</span>
            <span className="helperProfileStat">{profile.activity.chapterCount} chapters</span>
            <span className="helperProfileStat">{profile.activity.sceneCount} scenes</span>
            {profile.activity.wordCountGoal !== undefined && (
              <span className="helperProfileStat">Goal: {profile.activity.wordCountGoal.toLocaleString()}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfileHeader
