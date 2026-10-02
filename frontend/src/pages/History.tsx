import clsx from 'clsx'
import { motion } from 'framer-motion'
import {
  Activity,
  Clock,
  Coffee,
  Download,
  Eye,
  EyeOff,
  Gauge,
  Inbox,
  Loader2,
  MoveDown,
  Play,
  RefreshCw,
  Siren,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AlertsBarChart from '../components/AlertsBarChart'
import FatigueTimelineChart from '../components/FatigueTimelineChart'
import StatCard from '../components/StatCard'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import { downloadCsv, sessionDetailCsv, sessionsSummaryCsv } from '../lib/csv'
import { fatigueColor, fatigueLabel, formatClock, formatDateTime, isoLocal } from '../lib/format'
import { formatDuration } from '../lib/status'
import type { AlertType, SessionDetail, SessionSummary } from '../lib/types'

const EVENT_META: Record<AlertType, { label: string; color: string; icon: typeof Siren }> = {
  drowsy: { label: 'Drowsy', color: '#f43f5e', icon: Siren },
  yawn: { label: 'Yawn', color: '#fbbf24', icon: Coffee },
  distracted: { label: 'Distracted', color: '#38bdf8', icon: EyeOff },
}

const totalAlerts = (s: SessionSummary) => s.drowsy_alerts + s.yawn_alerts + s.distracted_alerts
const today = () => isoLocal(Date.now() / 1000).slice(0, 10)

export default function History() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [activeIds, setActiveIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Selected session lives in the URL (?session=8) so it survives reloads and can be linked
  const requested = Number(params.get('session'))
  const selectedId =
    sessions && sessions.some((s) => s.id === requested) ? requested : (sessions?.[0]?.id ?? null)
  const select = (id: number) => setParams({ session: String(id) }, { replace: true })

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [list, health] = await Promise.all([api.listSessions(), api.health()])
      setSessions(list)
      setActiveIds(health.active_sessions)
      setError(null)
    } catch {
      setError('Could not load sessions — is the backend running (python run.py)?')
      setSessions((s) => s ?? [])
    } finally {
      setRefreshing(false)
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null)
      return
    }
    let alive = true
    setDetailLoading(true)
    api
      .getSession(selectedId)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setDetailLoading(false))
    return () => {
      alive = false
    }
  }, [selectedId, sessions])

  // ---- Totals across all sessions --------------------------------------------
  const totals = useMemo(() => {
    const list = sessions ?? []
    const seconds = list.reduce((sum, s) => sum + s.active_seconds, 0)
    const weighted = list.reduce((sum, s) => sum + s.avg_fatigue * s.active_seconds, 0)
    return {
      count: list.length,
      seconds,
      alerts: list.reduce((sum, s) => sum + totalAlerts(s), 0),
      drowsy: list.reduce((sum, s) => sum + s.drowsy_alerts, 0),
      avgFatigue: seconds > 0 ? weighted / seconds : 0, // time-weighted: long drives count more
    }
  }, [sessions])

  // ---- Actions ---------------------------------------------------------------
  const exportAll = () => {
    if (!sessions?.length) return
    downloadCsv(`drowsiness-sessions-${today()}.csv`, sessionsSummaryCsv(sessions))
    toast({ kind: 'success', title: 'Exported', message: `${sessions.length} sessions saved as CSV` })
  }

  const exportSession = () => {
    if (!detail) return
    downloadCsv(`session-${detail.id}-${isoLocal(detail.started_at).slice(0, 10)}.csv`, sessionDetailCsv(detail))
    toast({ kind: 'success', title: `Session #${detail.id} exported`, message: `${detail.samples.length} samples, ${detail.events.length} events` })
  }

  const deleteSelected = async () => {
    if (!detail || !sessions) return
    if (!window.confirm(`Delete session #${detail.id} and all its events? This cannot be undone.`)) return
    try {
      await api.deleteSession(detail.id)
      const remaining = sessions.filter((s) => s.id !== detail.id)
      setSessions(remaining)
      if (remaining.length) select(remaining[0].id)
      else setParams({}, { replace: true })
      toast({ kind: 'info', title: `Session #${detail.id} deleted` })
    } catch (err) {
      toast({ kind: 'danger', title: 'Could not delete session', message: err instanceof Error ? err.message : undefined })
    }
  }

  // ---- Render ----------------------------------------------------------------
  if (sessions === null) {
    return (
      <div className="grid h-64 place-items-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Analytics</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Session history</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} className="btn-ghost" disabled={refreshing} title="Refresh">
            <RefreshCw className={clsx('h-4 w-4', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={exportAll} className="btn-primary" disabled={!sessions.length}>
            <Download className="h-4 w-4" /> Export all (CSV)
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">{error}</div>
      )}

      {sessions.length === 0 ? (
        <div className="glass mx-auto max-w-lg p-10 text-center">
          <Inbox className="mx-auto h-10 w-10 text-slate-400" />
          <h2 className="mt-4 font-display text-xl font-semibold">No sessions yet</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Every monitoring session is saved here with its alerts and fatigue curve.
          </p>
          <Link to="/monitor" className="btn-primary mt-6">
            <Play className="h-4 w-4" /> Start monitoring
          </Link>
        </div>
      ) : (
        <>
          {/* ---------------- Totals ---------------- */}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Activity} label="Sessions" value={String(totals.count)} sub="recorded drives" accent="#22d3ee" />
            <StatCard icon={Clock} label="Monitored" value={formatDuration(totals.seconds)} sub="total active time" accent="#94a3b8" />
            <StatCard icon={Siren} label="Alerts" value={String(totals.alerts)} sub={`${totals.drowsy} drowsy`} accent="#f43f5e" />
            <StatCard
              icon={Gauge}
              label="Avg fatigue"
              value={totals.avgFatigue.toFixed(0)}
              sub={`${fatigueLabel(totals.avgFatigue)} · time-weighted`}
              accent={fatigueColor(totals.avgFatigue)}
            />
          </section>

          <section className="glass p-5">
            <p className="label-caps">Trend</p>
            <h2 className="mb-3 font-display text-lg font-semibold">Alerts and average fatigue per session</h2>
            <AlertsBarChart sessions={sessions} />
          </section>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* ---------------- Session list ---------------- */}
            <section className="glass p-3 lg:col-span-4">
              <p className="label-caps px-2 pb-2 pt-1">All sessions</p>
              <ul className="max-h-[640px] space-y-1 overflow-y-auto pr-1">
                {sessions.map((s) => {
                  const selected = s.id === selectedId
                  const live = activeIds.includes(s.id)
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => select(s.id)}
                        className={clsx(
                          'w-full rounded-xl px-3 py-3 text-left transition',
                          selected
                            ? 'bg-cyan-400/10 ring-1 ring-cyan-400/40'
                            : 'hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.04]',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold">#{s.id}</span>
                            {live && (
                              <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                                LIVE
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{formatDuration(s.active_seconds)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(s.started_at)}</p>
                        <div className="mt-2 flex items-center gap-1.5">
                          {(['drowsy', 'yawn', 'distracted'] as const).map((type) => {
                            const n = type === 'drowsy' ? s.drowsy_alerts : type === 'yawn' ? s.yawn_alerts : s.distracted_alerts
                            const { color, label } = EVENT_META[type]
                            return (
                              <span
                                key={type}
                                title={`${n} ${label.toLowerCase()} alert${n === 1 ? '' : 's'}`}
                                className="rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold"
                                style={{ background: `${color}${n ? '22' : '0d'}`, color: n ? color : '#94a3b8' }}
                              >
                                {n}
                              </span>
                            )
                          })}
                          <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="h-2 w-2 rounded-full" style={{ background: fatigueColor(s.max_fatigue) }} />
                            peak {s.max_fatigue.toFixed(0)}
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            {/* ---------------- Selected session ---------------- */}
            <section className="glass relative p-5 lg:col-span-8">
              {detailLoading && (
                <div className="absolute right-5 top-5">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </div>
              )}
              {detail ? (
                  <motion.div
                    key={detail.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="label-caps">Session #{detail.id}</p>
                        <h2 className="font-display text-xl font-semibold">{formatDateTime(detail.started_at)}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {detail.ended_at
                            ? `${formatClock(detail.started_at)} → ${formatClock(detail.ended_at)}`
                            : activeIds.includes(detail.id)
                              ? 'In progress'
                              : 'Not closed properly (browser closed mid-session)'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={exportSession} className="btn-ghost">
                          <Download className="h-4 w-4" /> CSV
                        </button>
                        <button
                          onClick={deleteSelected}
                          className="btn-ghost text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                          disabled={activeIds.includes(detail.id)}
                          title={activeIds.includes(detail.id) ? 'Stop the session before deleting it' : 'Delete session'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Tile icon={Clock} label="Monitored" value={formatDuration(detail.active_seconds)} />
                      <Tile icon={Gauge} label="Avg fatigue" value={detail.avg_fatigue.toFixed(0)} color={fatigueColor(detail.avg_fatigue)} />
                      <Tile icon={Gauge} label="Peak fatigue" value={detail.max_fatigue.toFixed(0)} color={fatigueColor(detail.max_fatigue)} />
                      <Tile icon={Eye} label="Blinks" value={String(detail.blinks)} />
                      <Tile icon={Coffee} label="Yawns" value={String(detail.yawns)} />
                      <Tile icon={MoveDown} label="Head nods" value={String(detail.nods)} />
                    </div>

                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="label-caps">Fatigue over time</p>
                        <div className="flex flex-wrap gap-2">
                          {(Object.keys(EVENT_META) as AlertType[]).map((type) => {
                            const n = detail.events.filter((e) => e.type === type).length
                            const { color, label } = EVENT_META[type]
                            return (
                              <span key={type} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                <span className="h-3 w-0.5 rounded" style={{ background: color }} />
                                {label} × {n}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                      <FatigueTimelineChart detail={detail} />
                    </div>

                    <div>
                      <p className="label-caps mb-2">Event log</p>
                      {detail.events.length === 0 ? (
                        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">No alerts in this session.</p>
                      ) : (
                        <div className="max-h-72 overflow-auto rounded-xl border border-slate-200/70 dark:border-white/[0.06]">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                              <tr>
                                <th className="px-3 py-2 font-semibold">Time</th>
                                <th className="px-3 py-2 font-semibold">Alert</th>
                                <th className="px-3 py-2 text-right font-semibold">EAR</th>
                                <th className="px-3 py-2 text-right font-semibold">MAR</th>
                                <th className="px-3 py-2 text-right font-semibold">Lasted</th>
                                <th className="hidden px-3 py-2 font-semibold sm:table-cell">Detail</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/70 dark:divide-white/[0.06]">
                              {detail.events.map((e) => {
                                const { label, color, icon: Icon } = EVENT_META[e.type]
                                const reason = typeof e.details.reason === 'string' ? e.details.reason.replace('_', ' ') : ''
                                return (
                                  <tr key={e.id}>
                                    <td className="px-3 py-2 font-mono text-xs">
                                      {formatDuration(e.timestamp - detail.started_at)}
                                      <span className="ml-2 text-slate-400">{formatClock(e.timestamp)}</span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className="inline-flex items-center gap-1.5 font-medium" style={{ color }}>
                                        <Icon className="h-3.5 w-3.5" /> {label}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono">{e.ear?.toFixed(3) ?? '—'}</td>
                                    <td className="px-3 py-2 text-right font-mono">{e.mar?.toFixed(3) ?? '—'}</td>
                                    <td className="px-3 py-2 text-right font-mono">{e.duration ? `${e.duration.toFixed(1)} s` : '—'}</td>
                                    <td className="hidden px-3 py-2 text-xs text-slate-500 sm:table-cell dark:text-slate-400">
                                      {reason || (e.pitch !== null ? `pitch ${e.pitch.toFixed(0)}° · yaw ${e.yaw?.toFixed(0)}°` : '')}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  !detailLoading && (
                    <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                      Select a session to see its details.
                    </p>
                  )
                )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Tile({ icon: Icon, label, value, color }: { icon: typeof Clock; label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl bg-slate-900/[0.04] px-4 py-3 dark:bg-white/[0.04]">
      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1 font-mono text-xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  )
}
