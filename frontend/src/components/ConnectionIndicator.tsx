import clsx from 'clsx'
import { useConnection } from '../context/ConnectionContext'

/** Pill in the navbar showing backend / WebSocket connectivity. */
export default function ConnectionIndicator() {
  const { backendOnline, wsState } = useConnection()

  let label: string
  let dot: string
  let pulse = false
  let title: string

  if (wsState === 'open') {
    label = 'Live'
    dot = 'bg-emerald-400'
    pulse = true
    title = 'Streaming frames to the backend over WebSocket'
  } else if (wsState === 'connecting' || wsState === 'reconnecting') {
    label = wsState === 'connecting' ? 'Connecting…' : 'Reconnecting…'
    dot = 'bg-amber-400'
    pulse = true
    title = 'Trying to reach the detection WebSocket'
  } else if (backendOnline) {
    label = 'Backend online'
    dot = 'bg-cyan-400'
    title = 'FastAPI server is reachable'
  } else if (backendOnline === false) {
    label = 'Backend offline'
    dot = 'bg-rose-500'
    title = 'Cannot reach the FastAPI server. Start it with: python run.py'
  } else {
    label = 'Checking…'
    dot = 'bg-slate-400'
    title = 'Checking backend status'
  }

  return (
    <div
      title={title}
      className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
    >
      <span className="relative flex h-2 w-2">
        {pulse && <span className={clsx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', dot)} />}
        <span className={clsx('relative inline-flex h-2 w-2 rounded-full', dot)} />
      </span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  )
}
