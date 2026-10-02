import type { DriverStatus } from './types'

/** Display label and colour for each driver status (used by overlay, badges, charts). */
export const STATUS_META: Record<DriverStatus, { label: string; short: string; color: string }> = {
  alert: { label: 'ALERT', short: 'Alert', color: '#34d399' },
  yawning: { label: 'YAWNING', short: 'Yawning', color: '#fbbf24' },
  distracted: { label: 'EYES ON THE ROAD', short: 'Distracted', color: '#38bdf8' },
  drowsy: { label: 'DROWSY – WAKE UP!', short: 'Drowsy', color: '#f43f5e' },
  no_face: { label: 'NO FACE DETECTED', short: 'No face', color: '#94a3b8' },
}

/** 75 -> "01:15", 3725 -> "1:02:05" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
