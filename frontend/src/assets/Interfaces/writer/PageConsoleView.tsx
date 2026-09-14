export type PageSubTab = 'bookmark' | 'paragraph' | 'sentence' | 'pageChapterOutline' | 'pageSettings' | 'pageHelp'

interface PageConsoleViewProps {
  label: string
  body: string
}

// Page Console (chapter draft): entirely placeholder this pass -- the
// backend already has real draft endpoints (see the plan file), but
// wiring them up is deliberately deferred to a follow-up pass.
function PageConsoleView({ label, body }: PageConsoleViewProps) {
  return (
    <>
      <h2>{label}</h2>
      <p>{body}</p>
    </>
  )
}

export default PageConsoleView
