import { useEffect, useState } from 'react'

// The current time, re-read exactly on each minute (so a clock never shows a
// minute that has already passed) and again whenever the window comes back into
// view or gets focus (sleep, clock changes, timer drift).
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const d = new Date()
      setNow(d)
      if (timer) clearTimeout(timer)
      timer = setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    tick()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', tick)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', tick)
    }
  }, [])
  return now
}
