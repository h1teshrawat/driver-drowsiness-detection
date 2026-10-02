import clsx from 'clsx'
import { RotateCcw } from 'lucide-react'
import { useId } from 'react'

interface Props {
  label: string
  description: string
  value: number
  defaultValue: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  accent?: string
}

/** Labelled range slider with value readout, filled track and "reset to default". */
export default function SettingSlider({ label, description, value, defaultValue, min, max, step, format, onChange, accent = '#22d3ee' }: Props) {
  const id = useId()
  const pct = ((value - min) / (max - min)) * 100
  const isDefault = Math.abs(value - defaultValue) < step / 2

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        <span className="font-mono text-lg font-semibold" style={{ color: accent }}>
          {format(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-hud h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 dark:bg-white/10"
        style={{
          color: accent,
          backgroundImage: `linear-gradient(to right, ${accent} 0%, ${accent} ${pct}%, transparent ${pct}%)`,
        }}
      />
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          disabled={isDefault}
          className={clsx(
            'flex shrink-0 items-center gap-1 text-xs transition',
            isDefault ? 'text-slate-400 dark:text-slate-600' : 'text-cyan-600 hover:underline dark:text-cyan-300',
          )}
          title="Reset to default"
        >
          <RotateCcw className="h-3 w-3" />
          default {format(defaultValue)}
        </button>
      </div>
    </div>
  )
}
