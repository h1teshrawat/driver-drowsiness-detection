// Date and value formatting shared by the dashboard pages.
// Backend timestamps are unix SECONDS (Python's time.time()).

/** "2 Oct 2026, 22:01" */
export function formatDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** "22:01:24" */
export function formatClock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour12: false })
}

/** "2026-10-02 22:01:24" in local time — sorts correctly and opens cleanly in Excel. */
export function isoLocal(ts: number): string {
  const d = new Date(ts * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Colour for a 0–100 fatigue score: green < 40 ≤ amber < 70 ≤ red. */
export function fatigueColor(score: number): string {
  if (score >= 70) return '#f43f5e'
  if (score >= 40) return '#fbbf24'
  return '#34d399'
}

export function fatigueLabel(score: number): string {
  if (score >= 70) return 'High'
  if (score >= 40) return 'Moderate'
  return 'Low'
}
