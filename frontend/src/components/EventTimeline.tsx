import { AnimatePresence, motion } from 'framer-motion'
import { Coffee, EyeOff, Flag, PlugZap, Siren, type LucideIcon } from 'lucide-react'

export type TimelineKind = 'drowsy' | 'yawn' | 'distracted' | 'session' | 'connection'

export interface TimelineItem {
  id: number
  kind: TimelineKind
  time: Date
  title: string
  detail?: string
}

const KIND_STYLE: Record<TimelineKind, { icon: LucideIcon; color: string }> = {
  drowsy: { icon: Siren, color: '#f43f5e' },
  yawn: { icon: Coffee, color: '#fbbf24' },
  distracted: { icon: EyeOff, color: '#38bdf8' },
  session: { icon: Flag, color: '#34d399' },
  connection: { icon: PlugZap, color: '#94a3b8' },
}

/** Vertical list of events, newest first. */
export default function EventTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No events yet. Alerts will appear here as they happen.
      </p>
    )
  }

  return (
    <ol className="relative max-h-[380px] space-y-1 overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const { icon: Icon, color } = KIND_STYLE[item.kind]
          return (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0, x: 20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              exit={{ opacity: 0 }}
              className="relative flex gap-3 pb-3"
            >
              <span
                className="relative z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                style={{ background: `${color}22`, color, boxShadow: `0 0 0 1px ${color}55` }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 border-b border-slate-200/70 pb-3 dark:border-white/[0.06]">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <time className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {item.time.toLocaleTimeString([], { hour12: false })}
                  </time>
                </div>
                {item.detail && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>}
              </div>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ol>
  )
}
