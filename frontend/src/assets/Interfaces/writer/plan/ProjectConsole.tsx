import { createPortal } from 'react-dom'
import { useMemo, useState, type CSSProperties } from 'react'
import { emptyPlanner } from '../../../../lib/facets'
import { planRows } from '../../../../lib/planRows'
import { ArcIcon, FolderPlusIcon, GoalIcon, QueueIcon } from '../../../icons'
import { SplitArea, type SplitTile } from '../SplitArea'
import { useStoredState } from '../shared'
import { GoalsCard } from '../schedule/GoalsCard'
import { ICON_PX } from '../schedule/IconBtn'
import { DEFAULT_HUES, facetHueVars, type FacetHues } from '../schedule/ScheduleSettings'
import { ACCOUNT_OWNER, ownedProgress, useOwners } from '../schedule/useOwners'
import { useProjectFacts } from '../schedule/useProjectFacts'
import { localToday, useSchedule } from '../schedule/useSchedule'
import type { SplitNode } from '../../../../components/tiles/splitTree'
import { PhasesTile } from './PhasesTile'
import { PlanTimeline } from './PlanTimeline'
import { TemplateTile } from './TemplateTile'
import { TEMPLATE_OWNER, useTemplate } from './useTemplate'
import { WorkTile } from './WorkTile'

// The Project console: where a project's plan is defined. The plan (phases on rows, each defined by the result it builds to, with its milestones), the goals, and the
// work (processes, exercises, routines and tasks) are tiles on a split grid, with a rail of tile tabs in the title bar of the tile that holds the console.
// The Backlog, the Agenda and the Goals read what is defined here (it is the same planner), and a task can be dragged from here onto the Agenda.
// At the Project level it is the open project's; at the Dash a choice at the top picks the account, one of the projects or the **template** (the account's
// toolkit, with dates counted in days from a project's start), and the Template tile copies picked items from the template into a plan, or from a plan into it.

export const PLAN_TREE: SplitNode = {
  dir: 'row', ratio: 0.36,
  a: { id: 'phases' },
  b: { dir: 'row', ratio: 0.62, a: { dir: 'col', ratio: 0.38, a: { id: 'goals' }, b: { id: 'work' } }, b: { id: 'template' } },
}

// `titleSlot` is the element in the console's tab-tile title bar for the choice of what is planned and the rail of tiles (null while it is not drawn yet).
export default function ProjectConsole({ scope, projectIds, titles, titleSlot, columns }: { scope: 'dash' | 'project'; projectIds: string[]; titles: Record<string, string>; titleSlot?: HTMLElement | null; columns?: 'auto' | 'one' }) {
  const schedule = useSchedule(projectIds)
  const facts = useProjectFacts(projectIds)
  const [hues] = useStoredState<FacetHues>('scriblr.writer.facetHues', DEFAULT_HUES)
  const { owners } = useOwners(scope, projectIds, titles, schedule)
  const { template, setTemplate } = useTemplate()
  const [railHost, setRailHost] = useState<HTMLElement | null>(null)
  const [chosen, setChosen] = useStoredState<string>(`scriblr.writer.plan.owner.${scope}`, '')
  const today = schedule.loading ? localToday() : schedule.facets.today
  // The template is a plan to edit like the others, at the Dash.
  const choices = useMemo(() => (scope === 'dash' ? [...owners, { id: TEMPLATE_OWNER, label: 'Template', projectId: null, planner: template, setPlanner: setTemplate }] : owners), [scope, owners, template, setTemplate])
  const owner = choices.find(o => o.id === chosen) ?? owners.find(o => o.id !== ACCOUNT_OWNER) ?? owners[0]
  const progress = useMemo(() => (owner ? ownedProgress([owner], facts, schedule.facets, today) : []), [owner, facts, schedule.facets, today])
  const metGoals = useMemo(() => new Set(progress.filter(x => x.p.status === 'done').map(x => x.p.goal.id)), [progress])

  // The rows of the plan: the project, its books and their chapters (the account's plan and the template have the project's row alone).
  const outline = useMemo(() => facts.find(f => f.projectId === owner?.projectId)?.outline ?? [], [facts, owner?.projectId])
  const rows = useMemo(() => planRows(outline, owner?.label ?? ''), [outline, owner?.label])

  if (schedule.error) return <p className="wrError" role="alert">{schedule.error}</p>
  if (!owner) return <p className="wrMuted">Open a project to plan it.</p>
  const planner = owner.planner ?? emptyPlanner()
  const isTemplate = owner.id === TEMPLATE_OWNER
  const tiles: SplitTile[] = [
    {
      id: 'phases', title: 'Plan', Icon: ArcIcon,
      children: isTemplate
        ? <PhasesTile planner={planner} setPlanner={owner.setPlanner} today={today} metGoals={metGoals} relative />
        : <PlanTimeline ownerId={owner.id} planner={planner} setPlanner={owner.setPlanner} today={today} metGoals={metGoals} goals={progress.map(x => x.p)} rows={rows} />,
    },
    {
      id: 'goals', title: 'Goals', Icon: GoalIcon,
      children: <GoalsCard owners={[owner]} progress={progress} stats={[]} nodes={scope === 'project' ? facts[0]?.outline ?? [] : []} scoped={scope === 'project'} />,
    },
    { id: 'work', title: 'Work', Icon: QueueIcon, children: <WorkTile ownerId={owner.id} planner={planner} setPlanner={owner.setPlanner} today={today} /> },
    { id: 'template', title: 'Template', Icon: FolderPlusIcon, children: <TemplateTile owner={owner} template={template} setTemplate={setTemplate} today={today} /> },
  ]
  const choice = scope === 'dash' && choices.length > 1 && (
    <select className="wrField wrPlanOwner" aria-label="Plan for" value={owner.id} onChange={e => setChosen(e.target.value)}>
      {choices.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )
  return (
    <div className="wrSchedConsole wrPlanConsole" style={facetHueVars(hues) as CSSProperties}>
      {titleSlot === undefined ? <div className="wrSchedConsoleBar">{choice}</div> : titleSlot && createPortal(<>{choice}<span ref={setRailHost} className="wrSchedRail" /></>, titleSlot)}
      <SplitArea
        iconSize={ICON_PX} gridId={`scriblr.writer.plan.tiles.${scope}`} columns={columns} label="Project tiles" bar barHost={titleSlot === undefined ? undefined : railHost}
        tiles={tiles.map(t => ({ ...t, bodyClassName: 'wrSchedTileBody wrPlanTileBody' }))} defaultTree={PLAN_TREE}
      />
    </div>
  )
}
