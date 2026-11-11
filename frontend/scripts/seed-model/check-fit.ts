// Checks the refit of every outline of the old face: the points kept and how far the new outline strays from the old.
import { loadExact } from './exact'
import { exactList, outlineGap, refit } from './outline'

const tol = Number(process.argv[2] ?? 0.05)
const data = loadExact()
let before = 0, after = 0, worst = 0, worstName = ''
const rows: string[] = []
const all = [{ part: 'default', shapes: data.shapes, id: 'default' }, ...Object.entries(data.options).flatMap(([part, opts]) => opts.map(o => ({ part, shapes: o.shapes, id: o.id })))]
for (const o of all) {
  let b = 0, a = 0, w = 0
  for (const s of o.shapes) {
    const list = exactList(s.n), fitted = refit(list, tol)
    const gap = outlineGap(list, fitted)
    b += list.length; a += fitted.length; w = Math.max(w, gap)
    if (process.argv[3] === 'v' && (gap > 0.1 || fitted.length >= list.length)) rows.push(`   ${o.part}/${o.id}/${s.p}: ${list.length} -> ${fitted.length}, gap ${gap.toFixed(3)}, modes ${list.map(p => p.m).join('').replace(/(.)\1+/g, (m, c) => c + m.length)}`)
    if (gap > worst) { worst = gap; worstName = `${o.part}/${o.id}/${s.p}` }
  }
  before += b; after += a
  rows.push(`${o.part}/${o.id}: ${b} -> ${a} points, worst gap ${w.toFixed(3)}`)
}
console.log(rows.join('\n'))
console.log(`total ${before} -> ${after}; worst gap ${worst.toFixed(3)} at ${worstName}; tolerance ${tol}`)
