interface Props {
  title: string
  children: React.ReactNode
}

// Shared flat "pinned card" wrapper for the bulletin-board dashboard --
// minimalist-illustrated style, so no cork texture and no rotation (would
// hurt readability for the fairly dense panels it wraps); just a small
// pin-dot accent to read as "pinned to a board."
function BulletinNote({ title, children }: Props) {
  return (
    <div className="bulletin-note">
      <span className="bulletin-note__pin" aria-hidden="true" />
      <h4 className="bulletin-note__title">{title}</h4>
      <div className="bulletin-note__body">{children}</div>
    </div>
  )
}

export default BulletinNote
