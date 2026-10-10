import { audit, MIN_RATIO, ZONES, type AuditRow } from '../../src/theme/contrastAudit'
import { ZONE_LABEL } from '../../src/theme/types'

// project/contrast.md: the readability audit as a table per group, for every zone. Each cell is the pair's ratio at the default hues and, in
// brackets, its worst ratio over every hue a user can pick.

const GROUPS = ['Theme surfaces', 'Fills', 'Paper', 'Reactions', 'Edge tabs', 'Level panels']

const fmt = (n: number) => n.toFixed(1)

export function contrastMarkdown(rows: AuditRow[] = audit()): string {
  const lines: string[] = [
    '# Contrast',
    '',
    'Generated from `frontend/src/theme/contrastAudit.ts` by `npm run design-system`; the test `contrastAudit.test.ts` keeps every row at or above its threshold.',
    '',
    `Text is held to **${MIN_RATIO.text}:1** (WCAG 2.1 AA); icons and the edges of controls to **${MIN_RATIO.ui}:1**; large text (24px, or 18.66px bold) to ${MIN_RATIO.large}:1. The theme moves a colour's lightness only as far as its hue needs, so a ratio below holds for **every hue** a user can pick, not just the defaults.`,
    '',
    'Each cell is the ratio at the default hues (theme 330, accent 32, alert 200) and, in brackets, the worst ratio over a 30-degree grid of all three palette hues (and every 5 degrees of a level colour).',
    '',
  ]
  for (const group of GROUPS) {
    const inGroup = rows.filter(r => r.group === group)
    if (inGroup.length === 0) continue
    lines.push(`## ${group}`, '', `| Pair | Needs | ${ZONES.map(z => ZONE_LABEL[z]).join(' | ')} |`, `|---|---|${ZONES.map(() => '---').join('|')}|`)
    const ids = [...new Set(inGroup.map(r => r.id))]
    for (const id of ids) {
      const perZone = ZONES.map(z => inGroup.find(r => r.id === id && r.zone === z))
      const first = perZone.find(Boolean)!
      lines.push(`| ${first.label} | ${first.min}:1 | ${perZone.map(r => (r ? `${fmt(r.ratio)} (${fmt(r.worst)})` : '')).join(' | ')} |`)
    }
    lines.push('')
  }
  const failing = rows.filter(r => !r.pass)
  lines.push('## Below the threshold', '', failing.length === 0 ? 'Nothing: every documented pair reads in every zone for every hue.' : failing.map(r => `- ${ZONE_LABEL[r.zone]}: ${r.label}, ${fmt(r.worst)}:1 at ${r.worstAt}`).join('\n'), '')
  return lines.join('\n')
}
