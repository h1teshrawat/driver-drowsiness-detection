import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChartPoint } from '../components/LiveChart'
import type { DetectionResult } from '../lib/types'

const REDRAW_MS = 250

/**
 * Keeps the last `windowS` seconds of EAR/MAR for <LiveChart>.
 * Results arrive ~12x per second, but the chart re-renders only 4x per second
 * to keep CPU usage low. Times are re-expressed relative to "now" (e.g. -12.5).
 */
export function useRollingChart(windowS = 30) {
  const buffer = useRef<ChartPoint[]>([]) // absolute session seconds
  const dirty = useRef(false)
  const [data, setData] = useState<ChartPoint[]>([])

  const push = useCallback(
    (r: DetectionResult) => {
      const buf = buffer.current
      if (buf.length && r.session_seconds < buf[buf.length - 1].t) buf.length = 0 // counters were reset
      buf.push({ t: r.session_seconds, ear: r.face_detected ? r.ear : null, mar: r.face_detected ? r.mar : null })
      while (buf.length && r.session_seconds - buf[0].t > windowS + 1) buf.shift()
      dirty.current = true
    },
    [windowS],
  )

  const clear = useCallback(() => {
    buffer.current = []
    dirty.current = false
    setData([])
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!dirty.current) return
      dirty.current = false
      const buf = buffer.current
      const last = buf.length ? buf[buf.length - 1].t : 0
      setData(buf.map((p) => ({ ...p, t: Math.round((p.t - last) * 100) / 100 })))
    }, REDRAW_MS)
    return () => window.clearInterval(id)
  }, [])

  return { data, push, clear }
}
