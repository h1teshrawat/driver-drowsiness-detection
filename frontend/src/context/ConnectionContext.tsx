import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'

export type WsState = 'idle' | 'connecting' | 'open' | 'reconnecting'

interface ConnectionContextValue {
  /** null = not checked yet */
  backendOnline: boolean | null
  wsState: WsState
  setWsState: (state: WsState) => void
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null)

const HEALTH_POLL_MS = 5000

/**
 * App-wide connection status, shown by the navbar indicator.
 * - backendOnline: polled from GET /api/health every 5 s
 * - wsState: reported by the detection socket while monitoring
 */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const [wsState, setWsState] = useState<WsState>('idle')

  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        await api.health()
        if (alive) setBackendOnline(true)
      } catch {
        if (alive) setBackendOnline(false)
      }
    }
    check()
    const id = window.setInterval(check, HEALTH_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <ConnectionContext.Provider value={{ backendOnline, wsState, setWsState }}>
      {children}
    </ConnectionContext.Provider>
  )
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext)
  if (!ctx) throw new Error('useConnection must be used inside <ConnectionProvider>')
  return ctx
}
