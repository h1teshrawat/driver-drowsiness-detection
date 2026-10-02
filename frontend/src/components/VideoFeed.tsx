import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { Pause, ScanFace } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import type { CameraState } from '../hooks/useWebcam'
import { STATUS_META, formatDuration } from '../lib/status'
import type { DetectionResult } from '../lib/types'
import OverlayCanvas from './OverlayCanvas'

interface Props {
  videoRef: RefObject<HTMLVideoElement>
  cameraState: CameraState
  /** width / height of the camera image */
  aspect: number
  result: DetectionResult | null
  paused: boolean
  stats: { fps: number; latencyMs: number }
  /** Shown over the video while the camera is off (e.g. a Start button). */
  placeholder?: ReactNode
  /** Extra layer over the live video (e.g. a calibration countdown). */
  overlay?: ReactNode
}

/** Webcam video with the landmark overlay and HUD chips. */
export default function VideoFeed({ videoRef, cameraState, aspect, result, paused, stats, placeholder, overlay }: Props) {
  const live = cameraState === 'live'
  const status = result?.status ?? 'no_face'
  const meta = STATUS_META[status]
  const showOverlay = live && result && !paused

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-900/10 transition-shadow duration-300 dark:bg-black dark:ring-white/10"
      style={{
        aspectRatio: String(aspect),
        boxShadow: showOverlay ? `0 0 0 1px ${meta.color}55, 0 0 48px -12px ${meta.color}` : undefined,
      }}
    >
      {/* Video + canvas are mirrored together so it feels like a mirror,
          while the frames sent to the backend stay un-mirrored. */}
      <div className="absolute inset-0 -scale-x-100">
        <video
          ref={videoRef}
          playsInline
          muted
          className={clsx('h-full w-full object-fill transition-opacity', live ? 'opacity-100' : 'opacity-0')}
        />
        {showOverlay && <OverlayCanvas landmarks={result.landmarks} status={status} />}
      </div>

      {/* Scan line while streaming */}
      {live && !paused && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="h-1/3 w-full animate-scan bg-gradient-to-b from-transparent via-cyan-300/[0.07] to-transparent" />
        </div>
      )}

      {/* Top-left: status chip */}
      {showOverlay && (
        <div
          className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold tracking-wide text-white backdrop-blur-md"
          style={{ boxShadow: `inset 0 0 0 1px ${meta.color}66` }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} />
          {meta.short.toUpperCase()}
        </div>
      )}

      {/* Top-right: performance */}
      {live && (
        <div className="absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1.5 font-mono text-[11px] text-slate-200 backdrop-blur-md">
          {stats.fps.toFixed(0)} fps · {stats.latencyMs.toFixed(0)} ms
        </div>
      )}

      {/* Bottom-left: REC + session time */}
      {live && result && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 font-mono text-xs text-white backdrop-blur-md">
          <span className={clsx('h-2 w-2 rounded-full bg-rose-500', !paused && 'animate-pulse')} />
          {paused ? 'PAUSED' : 'REC'} {formatDuration(result.session_seconds)}
        </div>
      )}

      {/* No face hint */}
      <AnimatePresence>
        {live && !paused && result && !result.face_detected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 bottom-14 mx-auto flex w-fit items-center gap-2 rounded-xl bg-black/65 px-4 py-2 text-sm text-slate-100 backdrop-blur-md"
          >
            <ScanFace className="h-4 w-4 text-slate-300" />
            No face detected — face the camera and check the lighting
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paused veil */}
      {live && paused && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/55 backdrop-blur-[2px]">
          <div className="flex items-center gap-2 rounded-xl bg-black/60 px-4 py-2 text-sm font-medium text-white">
            <Pause className="h-4 w-4" /> Monitoring paused
          </div>
        </div>
      )}

      {live && overlay}

      {/* Camera off / error */}
      {!live && <div className="absolute inset-0 grid place-items-center p-6">{placeholder}</div>}
    </div>
  )
}
