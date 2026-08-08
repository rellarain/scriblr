import PlotSidebar from '../plan/PlotSidebar'

interface Props {
  onClose: () => void
}

// A partial-width slide-over (not full-bleed like the scrap-bin overlay) so
// whatever page opened it -- the book face or a chapter page -- stays
// visible and interactive underneath, letting a plotpoint be dragged out of
// this drawer onto a paragraph on the page. Wraps PlotSidebar unchanged;
// its own <h3>Plot</h3> heading doubles as the drawer's title.
function PlotDrawer({ onClose }: Props) {
  return (
    <div className="plot-drawer">
      <button type="button" className="plot-drawer__close" onClick={onClose} aria-label="Close plot drawer">
        ✕
      </button>
      <PlotSidebar />
    </div>
  )
}

export default PlotDrawer
