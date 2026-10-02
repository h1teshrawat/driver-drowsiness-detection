// CSV export, generated in the browser (no extra backend endpoint needed).

import { isoLocal } from './format'
import type { SessionDetail, SessionSummary } from './types'

export type CsvValue = string | number | boolean | null | undefined

/** Quote a cell only when needed (comma, quote or newline), doubling inner quotes — RFC 4180. */
function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' && !Number.isFinite(value)) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  return [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

/** Trigger a file download. The BOM makes Excel read the file as UTF-8. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const round = (v: number | null | undefined, digits: number) =>
  v === null || v === undefined ? null : Number(v.toFixed(digits))

/** One row per session — the overview table. */
export function sessionsSummaryCsv(sessions: SessionSummary[]): string {
  return toCsv(
    [
      'session_id',
      'started_at',
      'ended_at',
      'monitored_s',
      'blinks',
      'yawns',
      'nods',
      'drowsy_alerts',
      'yawn_alerts',
      'distracted_alerts',
      'avg_fatigue',
      'max_fatigue',
    ],
    sessions.map((s) => [
      s.id,
      isoLocal(s.started_at),
      s.ended_at ? isoLocal(s.ended_at) : '',
      round(s.active_seconds, 1),
      s.blinks,
      s.yawns,
      s.nods,
      s.drowsy_alerts,
      s.yawn_alerts,
      s.distracted_alerts,
      round(s.avg_fatigue, 1),
      round(s.max_fatigue, 1),
    ]),
  )
}

/**
 * One session as a single timeline: periodic samples (every 2 s) and alert
 * events merged and sorted by time. The `record` column says which is which.
 */
export function sessionDetailCsv(detail: SessionDetail): string {
  type Row = { ts: number; cells: CsvValue[] }
  const elapsed = (ts: number) => round(ts - detail.started_at, 1)

  const samples: Row[] = detail.samples.map((s) => ({
    ts: s.timestamp,
    cells: [isoLocal(s.timestamp), elapsed(s.timestamp), 'sample', round(s.ear, 4), round(s.mar, 4),
      round(s.perclos === null ? null : s.perclos * 100, 1), round(s.fatigue_score, 1), null, null, null, null],
  }))
  const events: Row[] = detail.events.map((e) => ({
    ts: e.timestamp,
    cells: [isoLocal(e.timestamp), elapsed(e.timestamp), e.type, round(e.ear, 4), round(e.mar, 4), null, null,
      round(e.pitch, 1), round(e.yaw, 1), round(e.duration, 2), typeof e.details.reason === 'string' ? e.details.reason : null],
  }))

  return toCsv(
    ['time', 'elapsed_s', 'record', 'ear', 'mar', 'perclos_pct', 'fatigue_score', 'pitch_deg', 'yaw_deg', 'duration_s', 'reason'],
    [...samples, ...events].sort((a, b) => a.ts - b.ts).map((r) => r.cells),
  )
}
