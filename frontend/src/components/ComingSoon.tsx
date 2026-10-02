import type { LucideIcon } from 'lucide-react'

/** Temporary placeholder for pages built in later phases. */
export default function ComingSoon({ icon: Icon, title, phase, text }: { icon: LucideIcon; title: string; phase: string; text: string }) {
  return (
    <div className="glass mx-auto mt-10 max-w-xl p-10 text-center">
      <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-600 ring-1 ring-cyan-400/30 dark:text-cyan-300">
        <Icon className="h-7 w-7" />
      </span>
      <p className="label-caps">Coming in phase {phase}</p>
      <h1 className="mt-2 font-display text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">{text}</p>
    </div>
  )
}
