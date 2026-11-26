import type { ReactNode } from 'react'

// The band under the header: the side interfaces' mini forms, side by side under the header's interface container
// (literal right, like the header's own right group). It is shown only while one of them is on (App.tsx sets --band-h);
// each part is that interface's own console bar.
function ShellBand({ children }: { children: ReactNode }) {
  return (
    <div className="shellBand" role="toolbar" aria-label="Side interfaces">
      {children}
    </div>
  )
}

export default ShellBand
