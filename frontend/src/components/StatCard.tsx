import { AnimatePresence, motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  accent?: string
}

/** Small metric tile; the number pops when it changes. */
export default function StatCard({ icon: Icon, label, value, sub, accent = '#22d3ee' }: Props) {
  return (
    <div className="glass group relative overflow-clip p-4">
      <div
        className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${accent}22`, color: accent }}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="label-caps">{label}</span>
      </div>
      <div className="relative mt-3 h-8 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={value}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="font-mono text-2xl font-semibold"
          >
            {value}
          </motion.p>
        </AnimatePresence>
      </div>
      {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  )
}
