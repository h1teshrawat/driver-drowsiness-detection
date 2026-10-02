import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDuration } from '../lib/status'
import type { AlertType, SessionDetail } from '../lib/types'

const EVENT_COLORS: Record<AlertType, string> = {
  drowsy: '#f43f5e',
  yawn: '#fbbf24',
  distracted: '#38bdf8',
}

/** Fatigue score and PERCLOS over one session, with a vertical marker for each alert. */
export default function FatigueTimelineChart({ detail }: { detail: SessionDetail }) {
  const data = detail.samples.map((s) => ({
    t: Math.round(s.timestamp - detail.started_at),
    fatigue: s.fatigue_score,
    perclos: s.perclos === null ? null : Math.round(s.perclos * 1000) / 10,
  }))
  const events = detail.events.map((e) => ({ t: Math.round(e.timestamp - detail.started_at), type: e.type, id: e.id }))
  const lastT = (list: { t: number }[]) => (list.length ? list[list.length - 1].t : 0)
  const end = Math.max(lastT(data), lastT(events), 10)

  if (data.length < 2) {
    return (
      <div className="grid h-64 place-items-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
        Not enough data — a sample is stored every 2 s while a face is visible.
      </div>
    )
  }

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="fatigueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[0, end]}
            tickFormatter={(v: number) => formatDuration(v)}
            stroke="rgba(148,163,184,0.6)"
            fontSize={11}
            tickLine={false}
          />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} stroke="rgba(148,163,184,0.6)" fontSize={11} tickLine={false} />
          <Tooltip
            isAnimationActive={false}
            contentStyle={{
              background: 'rgba(15,23,42,0.92)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              fontSize: 12,
              color: '#e2e8f0',
            }}
            labelFormatter={(v) => `at ${formatDuration(Number(v))}`}
            formatter={(v, name) => [typeof v === 'number' ? v.toFixed(1) : String(v), name]}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
          {/* fatigue bands */}
          <ReferenceLine y={40} stroke="#fbbf24" strokeOpacity={0.5} strokeDasharray="4 6" />
          <ReferenceLine y={70} stroke="#f43f5e" strokeOpacity={0.5} strokeDasharray="4 6" />
          {/* one vertical marker per alert */}
          {events.map((e) => (
            <ReferenceLine key={e.id} x={e.t} stroke={EVENT_COLORS[e.type]} strokeWidth={1.5} strokeOpacity={0.8} />
          ))}
          <Area
            name="Fatigue score"
            dataKey="fatigue"
            type="monotone"
            stroke="#22d3ee"
            strokeWidth={2}
            fill="url(#fatigueFill)"
            isAnimationActive={false}
          />
          <Line name="PERCLOS %" dataKey="perclos" type="monotone" stroke="#a78bfa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
