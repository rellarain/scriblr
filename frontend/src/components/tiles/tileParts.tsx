import type { ReactNode } from 'react'

// Small read-only pieces the tile bodies are made of.

export const TileBig = ({ value, label }: { value: ReactNode; label: string }) => (
  <>
    <div className="tileBig">{value}</div>
    <div className="tileSub">{label}</div>
  </>
)

export const TileSub = ({ children }: { children: ReactNode }) => <div className="tileSub">{children}</div>

// A list of rows: a name and a small value on the right. With `onOpen` the name is a
// button that opens the item straight from the tile (a quick action).
export function TileRows({ rows, onOpen }: { rows: Array<{ key: string; label: string; value?: ReactNode }>; onOpen?: (key: string) => void }) {
  return (
    <div>
      {rows.map(r => (
        <div key={r.key} className="tileRow">
          {onOpen
            ? <button type="button" className="tileRowBtn" onClick={() => onOpen(r.key)}>{r.label}</button>
            : <span>{r.label}</span>}
          {r.value !== undefined && <span>{r.value}</span>}
        </div>
      ))}
    </div>
  )
}

// Labelled bars scaled against the largest value.
export function TileBars({ rows }: { rows: Array<{ key: string; label: string; value: number; text: string }> }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div>
      {rows.map(r => (
        <div key={r.key} style={{ margin: '5px 0' }}>
          <div className="tileRow" style={{ border: 0, padding: 0 }}><span>{r.label}</span><span>{r.text}</span></div>
          <div className="tileBar"><b style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  )
}
