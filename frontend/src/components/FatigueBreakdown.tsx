import { motion } from 'framer-motion'
import { FATIGUE_MAX } from '../lib/defaults'

interface Props {
  breakdown: { perclos: number; yawn: number; nod: number } | undefined
}

const ROWS = [
  { key: 'perclos', label: 'Eye closure (PERCLOS)', color: '#22d3ee' },
  { key: 'yawn', label: 'Yawning', color: '#fbbf24' },
  { key: 'nod', label: 'Head nods', color: '#38bdf8' },
] as const

/** Shows how many points each factor adds to the fatigue score. */
export default function FatigueBreakdown({ breakdown }: Props) {
  return (
    <div className="space-y-2.5">
      {ROWS.map(({ key, label, color }) => {
        const value = breakdown?.[key] ?? 0
        const max = FATIGUE_MAX[key]
        return (
          <div key={key}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">{label}</span>
              <span className="font-mono text-slate-500 dark:text-slate-400">
                {value.toFixed(0)} / {max}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.07]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: color, boxShadow: `0 0 8px ${color}` }}
                initial={false}
                animate={{ width: `${(value / max) * 100}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
