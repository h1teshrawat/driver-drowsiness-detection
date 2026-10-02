import { motion } from 'framer-motion'

interface Props {
  value: number
  min?: number
  max: number
  /** Text in the middle, e.g. "0.31" */
  display: string
  label: string
  color: string
  /** Optional threshold marker on the arc */
  threshold?: number
  caption?: string
  size?: 'md' | 'lg'
}

const R = 42
const CIRC = 2 * Math.PI * R
const SWEEP = 0.75 // 270° arc, open at the bottom
const ARC = CIRC * SWEEP

/** Animated 270° circular gauge (SVG + framer-motion spring). */
export default function Gauge({ value, min = 0, max, display, label, color, threshold, caption, size = 'md' }: Props) {
  const frac = clamp01((value - min) / (max - min))
  const thresholdFrac = threshold !== undefined ? clamp01((threshold - min) / (max - min)) : null
  // Arc starts at 135° (bottom-left) and sweeps clockwise to 405° (bottom-right)
  const thresholdAngle = thresholdFrac !== null ? ((135 + 270 * thresholdFrac) * Math.PI) / 180 : 0

  return (
    <div className="flex flex-col items-center">
      <div className={size === 'lg' ? 'relative w-44 sm:w-48' : 'relative w-32'}>
        <svg viewBox="0 0 100 100" className="w-full overflow-visible">
          <g transform="rotate(135 50 50)">
            {/* track */}
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${ARC} ${CIRC}`}
              className="stroke-slate-200 dark:stroke-white/[0.07]"
            />
            {/* value */}
            <motion.circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${ARC} ${CIRC}`}
              initial={false}
              animate={{ strokeDashoffset: ARC * (1 - frac), stroke: color }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              style={{ filter: `drop-shadow(0 0 4px ${color}99)` }}
            />
          </g>
          {thresholdFrac !== null && (
            <line
              x1={50 + (R - 7) * Math.cos(thresholdAngle)}
              y1={50 + (R - 7) * Math.sin(thresholdAngle)}
              x2={50 + (R + 7) * Math.cos(thresholdAngle)}
              y2={50 + (R + 7) * Math.sin(thresholdAngle)}
              strokeWidth="1.8"
              strokeLinecap="round"
              className="stroke-slate-500 dark:stroke-slate-300"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
          <span
            className={size === 'lg' ? 'font-mono text-4xl font-semibold' : 'font-mono text-xl font-semibold'}
            style={{ color }}
          >
            {display}
          </span>
          <span className="label-caps mt-0.5">{label}</span>
        </div>
      </div>
      {caption && <p className="-mt-2 text-center text-xs text-slate-500 dark:text-slate-400">{caption}</p>}
    </div>
  )
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0
}
