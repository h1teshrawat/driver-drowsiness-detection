import { AnimatePresence, motion } from 'framer-motion'
import {
  BellRing,
  Camera,
  CameraOff,
  CheckCircle2,
  Crosshair,
  Eye,
  Loader2,
  MoveDown,
  RotateCcw,
  Save,
  ScanFace,
  Smile,
  Volume2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import HeadPoseIndicator from '../components/HeadPoseIndicator'
import LiveChart from '../components/LiveChart'
import SettingSlider from '../components/SettingSlider'
import ThresholdMeter from '../components/ThresholdMeter'
import VideoFeed from '../components/VideoFeed'
import { useToast } from '../context/ToastContext'
import { useDetectionSocket } from '../hooks/useDetectionSocket'
import { useRollingChart } from '../hooks/useRollingChart'
import { useWebcam } from '../hooks/useWebcam'
import { alarm } from '../lib/alarm'
import { api } from '../lib/api'
import {
  CALIBRATION_SECONDS,
  THRESHOLD_RATIO,
  computeCalibration,
  type CalibrationResult,
  type CalibrationSample,
} from '../lib/calibration'
import { DEFAULT_SETTINGS } from '../lib/defaults'
import type { DetectionResult, Settings } from '../lib/types'

type CalPhase = 'idle' | 'countdown' | 'recording' | 'saving'
const COUNTDOWN_FROM = 3
const PREVIEW_WINDOW_S = 20

const fmt3 = (v: number) => v.toFixed(3)
const fmt2 = (v: number) => v.toFixed(2)
const fmtSec = (v: number) => `${v.toFixed(1)} s`
const fmtDeg = (v: number) => `${v.toFixed(0)}°`
const fmtSigned = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`

export default function SettingsPage() {
  const toast = useToast()
  const cam = useWebcam()
  const chart = useRollingChart(PREVIEW_WINDOW_S)

  // ---- Saved (server) vs draft (sliders) settings -------------------------
  const [saved, setSaved] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Settings>(DEFAULT_SETTINGS)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSaved(s)
        setDraft(s)
      })
      .catch(() => setLoadError('Could not load settings — is the backend running (python run.py)?'))
  }, [])

  const dirtyKeys = saved
    ? (Object.keys(draft) as (keyof Settings)[]).filter((k) => Math.abs(draft[k] - saved[k]) > 1e-9)
    : []
  const dirty = dirtyKeys.length > 0
  const setField = (key: keyof Settings) => (value: number) => setDraft((d) => ({ ...d, [key]: value }))

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault() // browser asks "Leave site?"
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      const patch = Object.fromEntries(dirtyKeys.map((k) => [k, draft[k]])) as Partial<Settings>
      const s = await api.updateSettings(patch)
      setSaved(s)
      setDraft(s)
      toast({ kind: 'success', title: 'Settings saved', message: 'The live monitor uses them from the next frame' })
    } catch (err) {
      toast({ kind: 'danger', title: 'Could not save settings', message: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  const resetDefaults = async () => {
    if (!window.confirm('Reset every setting, including your calibration, to the defaults?')) return
    try {
      const s = await api.resetSettings()
      setSaved(s)
      setDraft(s)
      toast({ kind: 'info', title: 'Defaults restored' })
    } catch {
      toast({ kind: 'danger', title: 'Could not reset settings' })
    }
  }

  // ---- Alarm test ------------------------------------------------------------
  const [testingAlarm, setTestingAlarm] = useState(false)
  const testAlarm = () => {
    alarm.unlock()
    alarm.setVolume(draft.alarm_volume)
    alarm.startSiren()
    setTestingAlarm(true)
    window.setTimeout(() => {
      alarm.stopSiren()
      setTestingAlarm(false)
    }, 1500)
  }
  useEffect(() => () => alarm.stopSiren(), [])

  // ---- Calibration -----------------------------------------------------------
  const [phase, setPhase] = useState<CalPhase>('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM)
  const [progress, setProgress] = useState(0)
  const [calResult, setCalResult] = useState<CalibrationResult | null>(null)
  const [calError, setCalError] = useState<string | null>(null)
  const samples = useRef<CalibrationSample[]>([])
  const recording = useRef(false)
  const timers = useRef<number[]>([])

  const clearTimers = () => {
    timers.current.forEach((id) => {
      window.clearTimeout(id)
      window.clearInterval(id)
    })
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  const handleResult = useCallback(
    (r: DetectionResult) => {
      chart.push(r)
      if (recording.current && r.face_detected) {
        samples.current.push({ ear: r.ear, pitch: r.head_pose.pitch, yaw: r.head_pose.yaw })
      }
    },
    [chart.push],
  )

  const live = cam.state === 'live'
  const { result, stats } = useDetectionSocket({
    connect: live,
    sessionId: null, // preview stream: nothing is logged
    sending: live,
    captureFrame: cam.captureFrame,
    onResult: handleResult,
  })

  const finishCalibration = async () => {
    recording.current = false
    clearTimers()
    const outcome = computeCalibration(samples.current)
    if (!outcome.ok) {
      setCalError(outcome.error)
      setPhase('idle')
      toast({ kind: 'warning', title: 'Calibration failed', message: outcome.error })
      return
    }
    setPhase('saving')
    const r = outcome.result
    try {
      const s = await api.updateSettings({
        ear_threshold: r.threshold,
        head_pitch_offset_deg: r.pitchOffset,
        head_yaw_offset_deg: r.yawOffset,
      })
      setSaved(s)
      // keep any other unsaved slider edits, but take the calibrated values
      setDraft((d) => ({
        ...d,
        ear_threshold: s.ear_threshold,
        head_pitch_offset_deg: s.head_pitch_offset_deg,
        head_yaw_offset_deg: s.head_yaw_offset_deg,
      }))
      setCalResult(r)
      toast({ kind: 'success', title: 'Calibration saved', message: `Your EAR threshold is now ${r.threshold.toFixed(3)}` })
    } catch {
      setCalError('The measurement worked, but saving failed. Is the backend running?')
    } finally {
      setPhase('idle')
    }
  }

  const startCalibration = async () => {
    setCalError(null)
    setCalResult(null)
    if (!live && !(await cam.start())) return
    clearTimers()
    setPhase('countdown')
    setCountdown(COUNTDOWN_FROM)
    for (let i = 1; i < COUNTDOWN_FROM; i++) {
      timers.current.push(window.setTimeout(() => setCountdown(COUNTDOWN_FROM - i), i * 1000))
    }
    timers.current.push(
      window.setTimeout(() => {
        samples.current = []
        recording.current = true
        setProgress(0)
        setPhase('recording')
        const startedAt = performance.now()
        const tick = window.setInterval(() => {
          const p = Math.min(1, (performance.now() - startedAt) / (CALIBRATION_SECONDS * 1000))
          setProgress(p)
          if (p >= 1) void finishCalibration()
        }, 100)
        timers.current.push(tick)
      }, COUNTDOWN_FROM * 1000),
    )
  }

  const cancelCalibration = () => {
    clearTimers()
    recording.current = false
    setPhase('idle')
  }

  const stopPreview = () => {
    cancelCalibration()
    cam.stop()
    chart.clear()
  }

  const calibrating = phase !== 'idle'
  const r = live && result ? result : null

  // ---- Overlays on the preview video ------------------------------------------
  const overlay =
    phase === 'countdown' ? (
      <div className="absolute inset-0 grid place-items-center bg-slate-950/50 backdrop-blur-[1px]">
        <div className="text-center text-white">
          <AnimatePresence mode="popLayout">
            <motion.p
              key={countdown}
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              className="font-display text-7xl font-bold text-cyan-300"
            >
              {countdown}
            </motion.p>
          </AnimatePresence>
          <p className="mt-2 text-sm">Look at the screen with your eyes open normally</p>
        </div>
      </div>
    ) : phase === 'recording' ? (
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
        <p className="mb-2 text-center text-sm font-medium text-white">
          Recording… keep looking ahead · {samples.current.length} frames
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    ) : null

  const placeholder = (
    <div className="max-w-xs text-center text-slate-300">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
        {cam.state === 'error' ? <CameraOff className="h-6 w-6 text-rose-400" /> : <Camera className="h-6 w-6 text-cyan-300" />}
      </div>
      <p className="text-sm text-slate-400">
        {cam.state === 'error' ? cam.error : 'Turn on the preview to see how the thresholds behave on your face.'}
      </p>
      <button onClick={() => cam.start()} className="btn-primary mt-4">
        <Camera className="h-4 w-4" /> Start preview
      </button>
    </div>
  )

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Configuration</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Settings &amp; calibration</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={resetDefaults} className="btn-ghost" disabled={!saved}>
            <RotateCcw className="h-4 w-4" /> Defaults
          </button>
          <button onClick={save} className="btn-primary" disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save{dirty ? ` (${dirtyKeys.length})` : ''}
          </button>
        </div>
      </header>

      {loadError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">{loadError}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ---------------- Left: calibration + sliders ---------------- */}
        <div className="space-y-6 lg:col-span-7">
          <section className="glass relative overflow-clip p-6">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-md">
                <p className="label-caps">Personal calibration</p>
                <h2 className="mt-1 font-display text-xl font-semibold">Fit the thresholds to your eyes</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Look at the screen normally for {CALIBRATION_SECONDS} seconds. We measure your open-eye EAR and set the
                  drowsiness threshold to {Math.round(THRESHOLD_RATIO * 100)}% of it, and record your neutral head position.
                </p>
              </div>
              {calibrating ? (
                <button onClick={cancelCalibration} className="btn-ghost" disabled={phase === 'saving'}>
                  {phase === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {phase === 'saving' ? 'Saving…' : 'Cancel'}
                </button>
              ) : (
                <button onClick={startCalibration} className="btn-primary" disabled={!saved}>
                  <Crosshair className="h-4 w-4" /> Calibrate ({CALIBRATION_SECONDS} s)
                </button>
              )}
            </div>

            <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
              <Metric label="EAR threshold" value={saved ? fmt3(saved.ear_threshold) : '—'} />
              <Metric label="Neutral pitch" value={saved ? fmtSigned(saved.head_pitch_offset_deg) : '—'} />
              <Metric label="Neutral yaw" value={saved ? fmtSigned(saved.head_yaw_offset_deg) : '—'} />
            </div>

            <AnimatePresence>
              {calResult && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="relative mt-4 overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm"
                >
                  <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" /> Calibrated from {calResult.samples} frames
                  </p>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    Your open-eye EAR is <b className="font-mono">{fmt3(calResult.baselineEar)}</b> → threshold{' '}
                    <b className="font-mono">{fmt3(calResult.threshold)}</b> ({Math.round(THRESHOLD_RATIO * 100)}%). Neutral head
                    pose: pitch <b className="font-mono">{fmtSigned(calResult.pitchOffset)}</b>, yaw{' '}
                    <b className="font-mono">{fmtSigned(calResult.yawOffset)}</b>.
                  </p>
                </motion.div>
              )}
              {calError && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300"
                >
                  {calError}
                </motion.p>
              )}
            </AnimatePresence>
          </section>

          <Group icon={Eye} title="Eyes" accent="#22d3ee">
            <SettingSlider
              label="EAR threshold"
              description="Below this the eyes count as closed. Calibration sets it for you."
              value={draft.ear_threshold}
              defaultValue={DEFAULT_SETTINGS.ear_threshold}
              min={0.15}
              max={0.35}
              step={0.005}
              format={fmt3}
              onChange={setField('ear_threshold')}
            />
            <SettingSlider
              label="Drowsy duration"
              description="How long the eyes must stay closed before the alarm fires."
              value={draft.drowsy_duration_s}
              defaultValue={DEFAULT_SETTINGS.drowsy_duration_s}
              min={0.5}
              max={5}
              step={0.1}
              format={fmtSec}
              onChange={setField('drowsy_duration_s')}
            />
          </Group>

          <Group icon={Smile} title="Mouth" accent="#fbbf24">
            <SettingSlider
              label="MAR threshold"
              description="Mouth opening above this is yawn-sized (talking is usually 0.2–0.4)."
              value={draft.mar_threshold}
              defaultValue={DEFAULT_SETTINGS.mar_threshold}
              min={0.3}
              max={1.2}
              step={0.01}
              format={fmt2}
              onChange={setField('mar_threshold')}
              accent="#fbbf24"
            />
            <SettingSlider
              label="Yawn duration"
              description="How long the mouth must stay open to count as a yawn."
              value={draft.yawn_duration_s}
              defaultValue={DEFAULT_SETTINGS.yawn_duration_s}
              min={0.5}
              max={3}
              step={0.1}
              format={fmtSec}
              onChange={setField('yawn_duration_s')}
              accent="#fbbf24"
            />
          </Group>

          <Group icon={MoveDown} title="Head pose" accent="#38bdf8">
            <div className="rounded-xl bg-slate-900/[0.03] p-4 dark:bg-white/[0.03]">
              <HeadPoseIndicator
                pitch={r?.head_pose.pitch ?? 0}
                yaw={r?.head_pose.yaw ?? 0}
                pitchThreshold={draft.head_pitch_threshold_deg}
                yawThreshold={draft.head_yaw_threshold_deg}
                pitchOffset={draft.head_pitch_offset_deg}
                yawOffset={draft.head_yaw_offset_deg}
                active={!!r?.face_detected}
              />
            </div>
            <SettingSlider
              label="Head-down limit"
              description="Tilting the head further down than this counts as a nod."
              value={draft.head_pitch_threshold_deg}
              defaultValue={DEFAULT_SETTINGS.head_pitch_threshold_deg}
              min={10}
              max={45}
              step={1}
              format={fmtDeg}
              onChange={setField('head_pitch_threshold_deg')}
              accent="#38bdf8"
            />
            <SettingSlider
              label="Look-away limit"
              description="Turning the head sideways further than this counts as looking away."
              value={draft.head_yaw_threshold_deg}
              defaultValue={DEFAULT_SETTINGS.head_yaw_threshold_deg}
              min={15}
              max={60}
              step={1}
              format={fmtDeg}
              onChange={setField('head_yaw_threshold_deg')}
              accent="#38bdf8"
            />
            <SettingSlider
              label="Distraction duration"
              description="How long the head must be out of range before the distraction alert."
              value={draft.head_pose_duration_s}
              defaultValue={DEFAULT_SETTINGS.head_pose_duration_s}
              min={1}
              max={6}
              step={0.5}
              format={fmtSec}
              onChange={setField('head_pose_duration_s')}
              accent="#38bdf8"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400">
                Neutral pose: pitch <b className="font-mono">{fmtSigned(draft.head_pitch_offset_deg)}</b>, yaw{' '}
                <b className="font-mono">{fmtSigned(draft.head_yaw_offset_deg)}</b>
              </span>
              <button
                className="text-xs text-cyan-600 hover:underline disabled:text-slate-400 disabled:no-underline dark:text-cyan-300"
                disabled={draft.head_pitch_offset_deg === 0 && draft.head_yaw_offset_deg === 0}
                onClick={() => setDraft((d) => ({ ...d, head_pitch_offset_deg: 0, head_yaw_offset_deg: 0 }))}
              >
                Clear neutral pose
              </button>
            </div>
          </Group>

          <Group icon={BellRing} title="Alarm" accent="#f43f5e">
            <SettingSlider
              label="Alarm volume"
              description="Loudness of the drowsiness siren and alert chimes."
              value={draft.alarm_volume}
              defaultValue={DEFAULT_SETTINGS.alarm_volume}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={setField('alarm_volume')}
              accent="#f43f5e"
            />
            <button onClick={testAlarm} disabled={testingAlarm} className="btn-ghost">
              <Volume2 className="h-4 w-4" /> {testingAlarm ? 'Playing…' : 'Test alarm (1.5 s)'}
            </button>
          </Group>
        </div>

        {/* ---------------- Right: live preview ---------------- */}
        <div className="lg:col-span-5">
          <section className="glass space-y-5 p-5 lg:sticky lg:top-24">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-caps">Live preview</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Uses your unsaved slider values · not recorded</p>
              </div>
              {live && (
                <button onClick={stopPreview} className="btn-ghost px-3 py-1.5 text-xs" disabled={calibrating}>
                  <CameraOff className="h-3.5 w-3.5" /> Stop
                </button>
              )}
            </div>

            <VideoFeed
              videoRef={cam.videoRef}
              cameraState={cam.state}
              aspect={cam.size ? cam.size.width / cam.size.height : 4 / 3}
              result={r}
              paused={false}
              stats={stats}
              placeholder={placeholder}
              overlay={overlay}
            />

            <ThresholdMeter
              label="EAR (eyes)"
              value={r?.face_detected ? r.ear : null}
              max={0.45}
              threshold={draft.ear_threshold}
              triggerWhen="below"
              okText="eyes open"
              triggeredText="eyes closed"
              okColor="#22d3ee"
              triggeredColor="#f43f5e"
            />
            <ThresholdMeter
              label="MAR (mouth)"
              value={r?.face_detected ? r.mar : null}
              max={1}
              threshold={draft.mar_threshold}
              triggerWhen="above"
              okText="normal"
              triggeredText="yawn level"
              okColor="#a78bfa"
              triggeredColor="#fbbf24"
            />

            <div>
              <p className="label-caps mb-1">Last {PREVIEW_WINDOW_S} s</p>
              <LiveChart
                data={chart.data}
                earThreshold={draft.ear_threshold}
                marThreshold={draft.mar_threshold}
                windowS={PREVIEW_WINDOW_S}
              />
            </div>

            {live && r && !r.face_detected && (
              <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <ScanFace className="h-4 w-4" /> No face detected — face the camera.
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Floating save bar when there are unsaved changes */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-lg items-center justify-between gap-3 rounded-2xl bg-slate-900/95 px-4 py-3 text-sm text-white shadow-2xl ring-1 ring-white/10 backdrop-blur"
          >
            <span>
              {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? '' : 's'}
            </span>
            <div className="flex gap-2">
              <button onClick={() => saved && setDraft(saved)} className="btn px-3 py-1.5 text-slate-300 hover:text-white">
                Discard
              </button>
              <button onClick={save} disabled={saving} className="btn-primary px-3 py-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Group({ icon: Icon, title, accent, children }: { icon: typeof Eye; title: string; accent: string; children: ReactNode }) {
  return (
    <section className="glass space-y-6 p-6">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${accent}22`, color: accent }}>
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-900/[0.04] px-4 py-3 dark:bg-white/[0.04]">
      <p className="label-caps">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
    </div>
  )
}
