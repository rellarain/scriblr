export type PagesSubTab = 'pagesBookmark' | 'reaction' | 'flag' | 'export' | 'pagesSettings' | 'pagesHelp'

interface PagesConsoleViewProps {
  label: string
  body: string
}

// Pages Console (chapter preview/export): entirely placeholder this pass.
// Note: its "Flag" component (Add/Remove/Merge/Change/Simplify/Expand) is
// a different vocabulary than the outline/plot NodeFlag -- don't wire the
// two together when this becomes real.
function PagesConsoleView({ label, body }: PagesConsoleViewProps) {
  return (
    <>
      <h2>{label}</h2>
      <p>{body}</p>
    </>
  )
}

export default PagesConsoleView
