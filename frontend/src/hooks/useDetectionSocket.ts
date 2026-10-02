import { useCallback, useEffect, useRef, useState } from 'react'
import { useConnection } from '../context/ConnectionContext'
import type { DetectionResult } from '../lib/types'

interface Options {
  /** Keep a WebSocket open while true. */
  connect: boolean
  /** Session to log to; null = unlogged stream (settings preview, calibration). */
  sessionId: number | null
  /** Send frames while true (false = paused). */
  sending: boolean
  /** Returns a JPEG data URL of the current frame, or null if not ready. */
  captureFrame: () => string | null
  /** Target frames per second. */
  fps?: number
  /** Called for every result (use it for alerts/toasts). */
  onResult?: (result: DetectionResult) => void
}

const MAX_RECONNECT_DELAY_MS = 10_000
const STALE_REQUEST_MS = 3_000 // if a reply never comes, send the next frame anyway
const SESSION_GONE_CODE = 4404 // close code the backend uses for an unknown/ended session

/**
 * Streams webcam frames to /ws/detect and returns the latest result.
 *
 * - Flow control: only ONE frame is "in flight" at a time. The next frame is
 *   sent after the reply arrives, so a slow backend never builds up a queue.
 * - Auto-reconnect with exponential back-off (1 s, 2 s, 4 s ... max 10 s).
 */
export function useDetectionSocket({ connect: shouldConnect, sessionId, sending, captureFrame, fps = 12, onResult }: Options) {
  const { setWsState } = useConnection()
  const [result, setResult] = useState<DetectionResult | null>(null)
  const [stats, setStats] = useState({ fps: 0, latencyMs: 0 })
  const [fatalError, setFatalError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const inFlight = useRef<{ id: number; sentAt: number } | null>(null)
  const frameId = useRef(0)
  const meter = useRef({ count: 0, since: performance.now(), latency: 0 })

  // Keep the latest props in refs so the long-lived socket callbacks see them
  const sendingRef = useRef(sending)
  const captureRef = useRef(captureFrame)
  const onResultRef = useRef(onResult)
  sendingRef.current = sending
  captureRef.current = captureFrame
  onResultRef.current = onResult

  // ---- Connection lifecycle -------------------------------------------
  useEffect(() => {
    if (!shouldConnect) {
      setWsState('idle')
      return
    }
    let closedByUs = false
    let attempt = 0
    let reconnectTimer: number | undefined
    setFatalError(null)

    const connect = () => {
      setWsState(attempt === 0 ? 'connecting' : 'reconnecting')
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const query = sessionId === null ? '' : `?session_id=${sessionId}`
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws/detect${query}`)
      wsRef.current = ws

      ws.onopen = () => {
        attempt = 0
        inFlight.current = null
        setWsState('open')
      }

      ws.onmessage = (event) => {
        let msg: { type?: string; message?: string } & Partial<DetectionResult>
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }
        if (msg.type === 'result') {
          const now = performance.now()
          const m = meter.current
          if (inFlight.current) {
            const rtt = now - inFlight.current.sentAt
            m.latency = m.latency ? m.latency * 0.8 + rtt * 0.2 : rtt // smoothed round-trip
          }
          inFlight.current = null
          m.count++
          if (now - m.since >= 1000) {
            setStats({ fps: (m.count * 1000) / (now - m.since), latencyMs: m.latency })
            m.count = 0
            m.since = now
          }
          const res = msg as DetectionResult
          setResult(res)
          onResultRef.current?.(res)
        } else if (msg.type === 'error') {
          inFlight.current = null
          console.warn('[detect] server error:', msg.message)
        }
      }

      ws.onclose = (event) => {
        if (wsRef.current === ws) wsRef.current = null
        inFlight.current = null
        if (closedByUs) return
        if (event.code === SESSION_GONE_CODE) {
          setFatalError('This session is no longer active on the server. Start a new one.')
          setWsState('idle')
          return
        }
        attempt++
        setWsState('reconnecting')
        const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS)
        reconnectTimer = window.setTimeout(connect, delay)
      }

      ws.onerror = () => ws.close() // onclose handles the retry
    }

    connect()
    return () => {
      closedByUs = true
      window.clearTimeout(reconnectTimer)
      wsRef.current?.close()
      wsRef.current = null
      setWsState('idle')
    }
  }, [shouldConnect, sessionId, setWsState])

  // ---- Frame pump --------------------------------------------------------
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now()
      const m = meter.current
      if (now - m.since > 2000 && m.count === 0) {
        setStats((s) => (s.fps === 0 ? s : { ...s, fps: 0 })) // paused / stalled
        m.since = now
      }

      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN || !sendingRef.current) return
      if (inFlight.current && now - inFlight.current.sentAt < STALE_REQUEST_MS) return

      const image = captureRef.current()
      if (!image) return
      frameId.current++
      inFlight.current = { id: frameId.current, sentAt: now }
      ws.send(JSON.stringify({ type: 'frame', id: frameId.current, image }))
    }, 1000 / fps)
    return () => window.clearInterval(id)
  }, [fps])

  /** Ask the backend to zero the counters for this session. */
  const resetCounters = useCallback(() => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'reset' }))
  }, [])

  const clearResult = useCallback(() => {
    setResult(null)
    setStats({ fps: 0, latencyMs: 0 })
  }, [])

  return { result, stats, fatalError, resetCounters, clearResult }
}
