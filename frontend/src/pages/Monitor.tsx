import { motion } from 'framer-motion'
import {
  Activity,
  Camera,
  CameraOff,
  Clock,
  Coffee,
  Eye,
  Loader2,
  MoveDown,
  Pause,
  Play,
  Power,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import AlarmOverlay from '../components/AlarmOverlay'
import EventTimeline, { type TimelineItem } from '../components/EventTimeline'
import FatigueBreakdown from '../components/FatigueBreakdown'
import Gauge from '../components/Gauge'
import HeadPoseIndicator from '../components/HeadPoseIndicator'
import LiveChart from '../components/LiveChart'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import VideoFeed from '../components/VideoFeed'
import { useConnection } from '../context/ConnectionContext'
import { useToast } from '../context/ToastContext'
import { useDetectionSocket } from '../hooks/useDetectionSocket'
import { useRollingChart } from '../hooks/useRollingChart'
import { useWebcam } from '../hooks/useWebcam'
import { alarm } from '../lib/alarm'
import { ApiError, api } from '../lib/api'
import { DEFAULT_SETTINGS } from '../lib/defaults'
import { fatigueColor } from '../lib/format'
import { formatDuration } from '../lib/status'
import type { DetectionResult, Settings } from '../lib/types'

const CHART_WINDOW_S = 30
const MUTE_KEY = 'alarmMuted'

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export default function Monitor() {
  const cam = useWebcam()
  const toast = useToast()
  const { backendOnline, wsState } = useConnection()

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(readMuted)
  const [alarmDismissed, setAlarmDismissed] = useState(false)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const chart = useRollingChart(CHART_WINDOW_S)

  const timelineId = useRef(1)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  // ---- Settings (thresholds for chart lines, alarm volume) ---------------
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {})
  }, [])
  useEffect(() => alarm.setVolume(settings.alarm_volume), [settings.alarm_volume])
  useEffect(() => {
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [muted])

  const addTimeline = useCallback((item: Omit<TimelineItem, 'id' | 'time'> & { time?: Date }) => {
    setTimeline((list) => [{ id: timelineId.current++, time: item.time ?? new Date(), ...item }, ...list].slice(0, 100))
  }, [])

  // ---- Every result: feed the chart, announce new events -----------------
  const handleResult = useCallback(
    (r: DetectionResult) => {
      chart.push(r)

      for (const ev of r.events) {
        const time = new Date(ev.timestamp * 1000)
        if (ev.type === 'drowsy') {
          toast({
            kind: 'danger',
            title: 'Drowsiness detected',
            message: `Eyes closed for ${ev.duration?.toFixed(1)} s (EAR ${ev.ear.toFixed(2)})`,
          })
          addTimeline({ kind: 'drowsy', time, title: 'Drowsy — eyes closed', detail: `${ev.duration?.toFixed(1)} s · EAR ${ev.ear.toFixed(3)}` })
        } else if (ev.type === 'yawn') {
          toast({ kind: 'warning', title: `Yawn detected (#${r.yawns})`, message: `MAR ${ev.mar.toFixed(2)} — consider taking a break` })
          addTimeline({ kind: 'yawn', time, title: `Yawn #${r.yawns}`, detail: `MAR ${ev.mar.toFixed(3)} · ${ev.duration?.toFixed(1)} s` })
        } else {
          const nod = ev.reason === 'head_nod'
          toast({ kind: 'info', title: nod ? 'Head nodding' : 'Looking away', message: 'Keep your eyes on the road' })
          addTimeline({
            kind: 'distracted',
            time,
            title: nod ? 'Head nod / looking down' : 'Looking away',
            detail: `pitch ${ev.pitch?.toFixed(0)}° · yaw ${ev.yaw?.toFixed(0)}°`,
          })
        }
        if (ev.type !== 'drowsy' && !mutedRef.current) alarm.chime('warning')
      }
    },
    [toast, addTimeline, chart.push],
  )

  const { result, stats, fatalError, resetCounters, clearResult } = useDetectionSocket({
    connect: sessionId !== null,
    sessionId,
    sending: sessionId !== null && !paused && cam.state === 'live',
    captureFrame: cam.captureFrame,
    onResult: handleResult,
  })

  const running = sessionId !== null

  // ---- Alarm: siren while drowsy, until dismissed or eyes open -----------
  const drowsy = running && !paused && result?.status === 'drowsy'
  useEffect(() => {
    if (!drowsy) setAlarmDismissed(false) // re-arm for the next episode
  }, [drowsy])
  const alarmVisible = drowsy && !alarmDismissed
  useEffect(() => {
    if (alarmVisible && !muted) alarm.startSiren()
    else alarm.stopSiren()
  }, [alarmVisible, muted])
  useEffect(() => () => alarm.stopSiren(), [])

  // ---- Connection lost / restored notifications --------------------------
  const prevWs = useRef(wsState)
  useEffect(() => {
    const prev = prevWs.current
    prevWs.current = wsState
    if (!running) return
    if (wsState === 'reconnecting' && prev === 'open') {
      toast({ kind: 'warning', title: 'Connection lost', message: 'Reconnecting to the backend…' })
      addTimeline({ kind: 'connection', title: 'Connection lost' })
    } else if (wsState === 'open' && prev === 'reconnecting') {
      toast({ kind: 'success', title: 'Reconnected', message: 'Monitoring resumed' })
      addTimeline({ kind: 'connection', title: 'Reconnected' })
    }
  }, [wsState, running, toast, addTimeline])

  // ---- Session controls --------------------------------------------------
  const start = useCallback(async () => {
    alarm.unlock() // browsers only allow audio after a click
    setBusy(true)
    setError(null)
    try {
      if (!(await cam.start())) return
      const session = await api.startSession()
      clearResult()
      chart.clear()
      setTimeline([])
      setPaused(false)
      setSessionId(session.id)
      addTimeline({ kind: 'session', title: `Session #${session.id} started` })
      toast({ kind: 'success', title: `Session #${session.id} started`, message: 'Monitoring your eyes, mouth and head pose' })
    } catch (err) {
      cam.stop()
      setError(
        err instanceof ApiError
          ? `Backend error: ${err.message}`
          : 'Could not reach the backend. Is the FastAPI server running (python run.py)?',
      )
    } finally {
      setBusy(false)
    }
  }, [cam, clearResult, chart.clear, addTimeline, toast])

  const stop = useCallback(async () => {
    const id = sessionId
    setSessionId(null)
    setPaused(false)
    alarm.stopSiren()
    cam.stop()
    if (id === null) return
    try {
      const summary = await api.stopSession(id)
      const alerts = summary.drowsy_alerts + summary.yawn_alerts + summary.distracted_alerts
      addTimeline({ kind: 'session', title: `Session #${id} ended`, detail: `${formatDuration(summary.active_seconds)} · ${alerts} alerts` })
      toast({
        kind: 'info',
        title: `Session #${id} saved`,
        message: `${formatDuration(summary.active_seconds)} monitored · ${alerts} alert${alerts === 1 ? '' : 's'} · see History`,
      })
    } catch {
      /* backend may be down; it closes the session on shutdown/restart */
    }
  }, [sessionId, cam, addTimeline, toast])

  const reset = useCallback(() => {
    resetCounters()
    chart.clear()
    toast({ kind: 'info', title: 'Counters reset' })
  }, [resetCounters, chart.clear, toast])

  // End the session if the user navigates away or closes the tab
  const sessionRef = useRef<number | null>(null)
  sessionRef.current = sessionId
  useEffect(() => {
    const onUnload = () => {
      if (sessionRef.current !== null) navigator.sendBeacon(`/api/sessions/${sessionRef.current}/stop`)
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      if (sessionRef.current !== null) api.stopSession(sessionRef.current).catch(() => {})
    }
  }, [])

  // ---- Derived display values ----------------------------------------------
  const live = running && result !== null
  const r = live ? result : null
  const shownError = error ?? fatalError
  const badgeState = !running ? 'standby' : paused ? 'paused' : (result?.status ?? 'no_face')
  const fatigue = r?.fatigue_score ?? 0
  const earLow = r ? r.face_detected && r.ear < settings.ear_threshold : false
  const marHigh = r ? r.mar > settings.mar_threshold : false

  const placeholder = (
    <div className="max-w-sm text-center text-slate-300">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10">
        {cam.state === 'error' ? <CameraOff className="h-7 w-7 text-rose-400" /> : <Camera className="h-7 w-7 text-cyan-300" />}
      </div>
      {cam.state === 'error' ? (
        <>
          <p className="font-display text-lg font-semibold text-white">Camera unavailable</p>
          <p className="mt-2 text-sm text-slate-400">{cam.error}</p>
        </>
      ) : (
        <>
          <p className="font-display text-lg font-semibold text-white">Camera is off</p>
          <p className="mt-2 text-sm text-slate-400">
            Press <span className="text-cyan-300">Start session</span> and allow camera access. Frames are analysed locally
            by your own backend.
          </p>
        </>
      )}
      <button onClick={start} disabled={busy} className="btn-primary mt-5">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
        {cam.state === 'error' ? 'Try again' : 'Start session'}
      </button>
    </div>
  )

  return (
    <>
      <motion.div
        className="space-y-6"
        animate={alarmVisible ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
        transition={alarmVisible ? { duration: 0.5, repeat: Infinity, repeatDelay: 0.7 } : { duration: 0.2 }}
      >
        {/* ---------------- Header + controls ---------------- */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-caps">Live monitor{running && ` · session #${sessionId}`}</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Driver dashboard</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMuted((m) => !m)}
              className="btn-ghost"
              title={muted ? 'Unmute alarm' : 'Mute alarm'}
              aria-pressed={muted}
            >
              {muted ? <VolumeX className="h-4 w-4 text-rose-500" /> : <Volume2 className="h-4 w-4" />}
              <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound on'}</span>
            </button>
            {!running ? (
              <button onClick={start} disabled={busy} className="btn-primary">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start session
              </button>
            ) : (
              <>
                <button onClick={() => setPaused((p) => !p)} className="btn-ghost">
                  {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {paused ? 'Resume' : 'Pause'}
                </button>
                <button onClick={reset} className="btn-ghost" title="Reset counters">
                  <RotateCcw className="h-4 w-4" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
                <button onClick={stop} className="btn-danger">
                  <Square className="h-4 w-4" /> Stop
                </button>
              </>
            )}
          </div>
        </header>

        {shownError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
            {shownError}
          </div>
        )}
        {backendOnline === false && !running && !shownError && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            The backend is offline. Start it in a terminal: <code className="font-mono">python run.py</code> (inside{' '}
            <code className="font-mono">backend</code>).
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          {/* ---------------- Left: video, chart, stats ---------------- */}
          <div className="space-y-6 lg:col-span-8">
            <VideoFeed
              videoRef={cam.videoRef}
              cameraState={cam.state}
              aspect={cam.size ? cam.size.width / cam.size.height : 4 / 3}
              result={running ? result : null}
              paused={paused}
              stats={stats}
              placeholder={placeholder}
            />

            <section className="glass p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="label-caps">Signals</p>
                  <h2 className="font-display text-lg font-semibold">EAR &amp; MAR — last {CHART_WINDOW_S} s</h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  EAR below the red line = eyes closed · MAR above the amber line = mouth wide open
                </p>
              </div>
              <LiveChart data={chart.data}earThreshold={settings.ear_threshold} marThreshold={settings.mar_threshold} windowS={CHART_WINDOW_S} />
            </section>

            <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard icon={Eye} label="Blinks" value={r ? String(r.blinks) : '—'} sub="this session" accent="#22d3ee" />
              <StatCard
                icon={Activity}
                label="Blink rate"
                value={r ? `${r.blinks_per_min.toFixed(0)}/min` : '—'}
                sub="typical 10–20 / min"
                accent="#34d399"
              />
              <StatCard icon={Coffee} label="Yawns" value={r ? String(r.yawns) : '—'} sub="this session" accent="#fbbf24" />
              <StatCard icon={MoveDown} label="Head nods" value={r ? String(r.nods) : '—'} sub="this session" accent="#38bdf8" />
              <StatCard
                icon={Eye}
                label="PERCLOS"
                value={r ? `${(r.perclos * 100).toFixed(1)}%` : '—'}
                sub="eyes closed, last 60 s"
                accent="#a78bfa"
              />
              <StatCard
                icon={Clock}
                label="Duration"
                value={r ? formatDuration(r.session_seconds) : '—'}
                sub="active monitoring time"
                accent="#94a3b8"
              />
            </section>
          </div>

          {/* ---------------- Right: status, gauges, pose, timeline ---------------- */}
          <div className="space-y-6 lg:col-span-4">
            <StatusBadge state={badgeState} />

            <section className="glass p-5">
              <p className="label-caps mb-2">Fatigue score</p>
              <div className="flex justify-center">
                <Gauge
                  size="lg"
                  value={fatigue}
                  max={100}
                  display={r ? fatigue.toFixed(0) : '—'}
                  label="/ 100"
                  color={r ? fatigueColor(fatigue) : '#64748b'}
                  caption={!r ? undefined : fatigue >= 70 ? 'High — take a break now' : fatigue >= 40 ? 'Moderate — stay alert' : 'Low'}
                />
              </div>
              <div className="mt-4">
                <FatigueBreakdown breakdown={r?.fatigue_breakdown} />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2 border-t border-slate-200/70 pt-5 dark:border-white/[0.06]">
                <Gauge
                  value={r?.ear ?? 0}
                  max={0.45}
                  display={r ? r.ear.toFixed(2) : '—'}
                  label="EAR"
                  color={!r ? '#64748b' : earLow ? '#f43f5e' : '#22d3ee'}
                  threshold={settings.ear_threshold}
                  caption={`closed < ${settings.ear_threshold.toFixed(2)}`}
                />
                <Gauge
                  value={r?.mar ?? 0}
                  max={1}
                  display={r ? r.mar.toFixed(2) : '—'}
                  label="MAR"
                  color={!r ? '#64748b' : marHigh ? '#fbbf24' : '#a78bfa'}
                  threshold={settings.mar_threshold}
                  caption={`yawn > ${settings.mar_threshold.toFixed(2)}`}
                />
              </div>
            </section>

            <section className="glass p-5">
              <p className="label-caps mb-3">Head pose</p>
              <HeadPoseIndicator
                pitch={r?.head_pose.pitch ?? 0}
                yaw={r?.head_pose.yaw ?? 0}
                pitchThreshold={settings.head_pitch_threshold_deg}
                yawThreshold={settings.head_yaw_threshold_deg}
                pitchOffset={settings.head_pitch_offset_deg}
                yawOffset={settings.head_yaw_offset_deg}
                active={!!r?.face_detected}
              />
            </section>

            <section className="glass p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="label-caps">Event timeline</p>
                <span className="font-mono text-xs text-slate-500">{timeline.length}</span>
              </div>
              <EventTimeline items={timeline} />
            </section>
          </div>
        </div>
      </motion.div>

      <AlarmOverlay active={alarmVisible} onDismiss={() => setAlarmDismissed(true)} />
    </>
  )
}
