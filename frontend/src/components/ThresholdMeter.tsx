import { motion } from 'framer-motion'

interface Props {
  label: string
  value: number | null
  max: number
  threshold: number
  /** "below": crossing means value < threshold (EAR); "above": value > threshold (MAR) */
  triggerWhen: 'below' | 'above'
  okText: string
  triggeredText: string
  okColor: string
  triggeredColor: string
}

/** Horizontal bar showing a live value against a (draft) threshold marker. */
export default function ThresholdMeter({ label, value, max, threshold, triggerWhen, okText, triggeredText, okColor, triggeredColor }: Props) {
  const has = value !== null
  const triggered = has && (triggerWhen === 'below' ? value < threshold : value > threshold)
  const color = !has ? '#64748b' : triggered ? triggeredColor : okColor
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="label-caps">{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-lg font-semibold" style={{ color }}>
            {has ? value.toFixed(3) : '—'}
          </span>
          <span className="w-24 text-right text-xs font-semibold" style={{ color }}>
            {has ? (triggered ? triggeredText : okText) : ''}
          </span>
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-slate-200 dark:bg-white/[0.07]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color, boxShadow: `0 0 10px ${color}88` }}
          initial={false}
          animate={{ width: has ? pct(value) : '0%' }}
          transition={{ type: 'spring', stiffness: 220, damping: 26 }}
        />
        <motion.div
          className="absolute -inset-y-1 w-0.5 rounded bg-slate-700 dark:bg-white"
          initial={false}
          animate={{ left: pct(threshold) }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          title={`threshold ${threshold}`}
        />
      </div>
    </div>
  )
}
