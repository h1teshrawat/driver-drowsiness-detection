import { motion } from 'framer-motion'

interface Props {
  pitch: number
  yaw: number
  pitchThreshold: number
  yawThreshold: number
  pitchOffset: number
  yawOffset: number
  active: boolean
}

const RANGE = 60 // degrees shown from centre to edge
const HALF = 44 // px in the 100x100 viewBox

/** HUD crosshair: the dot shows where the head is pointing; dashed lines are the alert limits. */
export default function HeadPoseIndicator({ pitch, yaw, pitchThreshold, yawThreshold, pitchOffset, yawOffset, active }: Props) {
  const pitchRel = pitch - pitchOffset
  const yawRel = yaw - yawOffset
  const toPx = (deg: number) => Math.max(-HALF, Math.min(HALF, (deg / RANGE) * HALF))
  // The video is mirrored, so mirror yaw too: turning your head left moves the dot left.
  const x = 50 - toPx(yawRel)
  const y = 50 + toPx(pitchRel)
  const outside = pitchRel > pitchThreshold || Math.abs(yawRel) > yawThreshold
  const color = !active ? '#64748b' : outside ? '#38bdf8' : '#34d399'
  const yawPx = (yawThreshold / RANGE) * HALF
  const pitchPx = (pitchThreshold / RANGE) * HALF

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0">
        <circle cx="50" cy="50" r="46" fill="none" className="stroke-slate-300 dark:stroke-white/10" />
        <circle cx="50" cy="50" r="23" fill="none" className="stroke-slate-200 dark:stroke-white/[0.06]" />
        <line x1="4" y1="50" x2="96" y2="50" className="stroke-slate-200 dark:stroke-white/[0.06]" />
        <line x1="50" y1="4" x2="50" y2="96" className="stroke-slate-200 dark:stroke-white/[0.06]" />
        {/* limits: left/right (yaw) and down (pitch) */}
        <g stroke="#38bdf8" strokeDasharray="2 3" strokeOpacity="0.7">
          <line x1={50 - yawPx} y1="8" x2={50 - yawPx} y2="92" />
          <line x1={50 + yawPx} y1="8" x2={50 + yawPx} y2="92" />
          <line x1="8" y1={50 + pitchPx} x2="92" y2={50 + pitchPx} />
        </g>
        <motion.circle
          r="6"
          fill={color}
          initial={false}
          animate={{ cx: x, cy: y }}
          transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="label-caps">Pitch</dt>
          <dd className="font-mono font-semibold">
            {active ? `${pitchRel >= 0 ? '+' : ''}${pitchRel.toFixed(0)}°` : '—'}
            <span className="ml-1 text-xs font-normal text-slate-500">{active && pitchRel > 5 ? 'down' : ''}</span>
          </dd>
        </div>
        <div>
          <dt className="label-caps">Yaw</dt>
          <dd className="font-mono font-semibold">{active ? `${yawRel >= 0 ? '+' : ''}${yawRel.toFixed(0)}°` : '—'}</dd>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Limits: down {pitchThreshold}°, sideways ±{yawThreshold}°
        </p>
      </dl>
    </div>
  )
}
