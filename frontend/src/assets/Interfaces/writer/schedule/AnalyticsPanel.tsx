import type { ComponentProps } from 'react'
import { useStoredState } from '../shared'
import { ActivityCard } from './ActivityCard'
import { AnalyticsCard } from './AnalyticsCard'
import { Fold } from './Fold'
import { ReviewCard } from './ReviewCard'

// The Analytics tile: the Activity chart first, always open, and taking the height the folds below it leave; then the Review and the Charts, each a fold
// (closed until opened; which are open is remembered). The Activity controls (facets, chart, shade) are in the tile's title bar (ActivityControls).

type Section = 'review' | 'charts'

export function AnalyticsPanel({ activity, review, charts }: {
  activity: ComponentProps<typeof ActivityCard>
  review: ComponentProps<typeof ReviewCard>
  charts: ComponentProps<typeof AnalyticsCard>
}) {
  const [open, setOpen] = useStoredState<Section[]>('scriblr.writer.schedule.analytics.open', [])
  const toggle = (s: Section) => setOpen(open.includes(s) ? open.filter(x => x !== s) : [...open, s])
  return (
    <div className="wrAnalytics">
      <ActivityCard {...activity} />
      <Fold title="Review" open={open.includes('review')} onToggle={() => toggle('review')}>
        <ReviewCard {...review} />
      </Fold>
      <Fold title="Charts" open={open.includes('charts')} onToggle={() => toggle('charts')}>
        <AnalyticsCard {...charts} />
      </Fold>
    </div>
  )
}
