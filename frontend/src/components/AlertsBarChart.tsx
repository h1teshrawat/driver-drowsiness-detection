import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SessionSummary } from '../lib/types'

const MAX_SESSIONS = 12

/** Stacked alerts per session (bars) with the session's average fatigue (line). */
export default function AlertsBarChart({ sessions }: { sessions: SessionSummary[] }) {
  // API returns newest first; chart reads left-to-right in time order
  const data = sessions
    .slice(0, MAX_SESSIONS)
    .reverse()
    .map((s) => ({
      name: `#${s.id}`,
      drowsy: s.drowsy_alerts,
      yawn: s.yawn_alerts,
      distracted: s.distracted_alerts,
      fatigue: s.avg_fatigue,
    }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" stroke="rgba(148,163,184,0.6)" fontSize={11} tickLine={false} />
          <YAxis yAxisId="alerts" allowDecimals={false} stroke="rgba(148,163,184,0.6)" fontSize={11} tickLine={false} />
          <YAxis yAxisId="fatigue" orientation="right" domain={[0, 100]} hide />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: 'rgba(148,163,184,0.08)' }}
            contentStyle={{
              background: 'rgba(15,23,42,0.92)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              fontSize: 12,
              color: '#e2e8f0',
            }}
            formatter={(v, name) => [typeof v === 'number' ? (name === 'Avg fatigue' ? v.toFixed(1) : v) : String(v), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
          <Bar yAxisId="alerts" name="Drowsy" dataKey="drowsy" stackId="a" fill="#f43f5e" maxBarSize={36} />
          <Bar yAxisId="alerts" name="Yawn" dataKey="yawn" stackId="a" fill="#fbbf24" maxBarSize={36} />
          <Bar yAxisId="alerts" name="Distracted" dataKey="distracted" stackId="a" fill="#38bdf8" radius={[6, 6, 0, 0]} maxBarSize={36} />
          <Line yAxisId="fatigue" name="Avg fatigue" dataKey="fatigue" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
