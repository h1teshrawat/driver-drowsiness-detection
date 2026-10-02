import { AnimatePresence, motion } from 'framer-motion'
import { Coffee, EyeOff, Pause, Power, ScanFace, ShieldCheck, Siren, type LucideIcon } from 'lucide-react'
import { STATUS_META } from '../lib/status'
import type { DriverStatus } from '../lib/types'

type BadgeState = DriverStatus | 'standby' | 'paused'

const ICONS: Record<BadgeState, LucideIcon> = {
  alert: ShieldCheck,
  yawning: Coffee,
  distracted: EyeOff,
  drowsy: Siren,
  no_face: ScanFace,
  standby: Power,
  paused: Pause,
}

const HINTS: Record<BadgeState, string> = {
  alert: 'Driver is attentive',
  yawning: 'Yawn detected — consider a break soon',
  distracted: 'Head turned away or down',
  drowsy: 'Eyes closed too long — pull over safely',
  no_face: 'Face not visible to the camera',
  standby: 'Start a session to begin monitoring',
  paused: 'Monitoring is paused',
}

/** Large animated status display. */
export default function StatusBadge({ state }: { state: BadgeState }) {
  const meta =
    state === 'standby'
      ? { label: 'STANDBY', color: '#64748b' }
      : state === 'paused'
        ? { label: 'PAUSED', color: '#94a3b8' }
        : STATUS_META[state]
  const Icon = ICONS[state]
  const critical = state === 'drowsy'

  return (
    <motion.div
      className="glass relative overflow-hidden p-5"
      animate={{ boxShadow: `inset 0 0 0 1px ${meta.color}55, 0 0 40px -14px ${meta.color}` }}
      transition={{ duration: 0.3 }}
    >
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: meta.color }} />
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="flex items-center gap-4"
        >
          <motion.span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl"
            style={{ background: `${meta.color}22`, color: meta.color }}
            animate={critical ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={critical ? { duration: 0.6, repeat: Infinity } : undefined}
          >
            <Icon className="h-7 w-7" />
          </motion.span>
          <div className="min-w-0">
            <p className="label-caps">Driver state</p>
            <p className="font-display text-2xl font-bold tracking-tight sm:text-[1.7rem]" style={{ color: meta.color }}>
              {meta.label}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{HINTS[state]}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
