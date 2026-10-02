import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface ChartPoint {
  /** seconds relative to now (e.g. -12.5) */
  t: number
  ear: number | null
  mar: number | null
}

interface Props {
  data: ChartPoint[]
  earThreshold: number
  marThreshold: number
  windowS?: number
}

const EAR_COLOR = '#22d3ee'
const MAR_COLOR = '#a78bfa'

/** Scrolling EAR / MAR chart for the last 30 s with threshold lines. */
export default function LiveChart({ data, earThreshold, marThreshold, windowS = 30 }: Props) {
  return (
    <div className="h-56 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[-windowS, 0]}
            ticks={[-30, -25, -20, -15, -10, -5, 0].filter((x) => x >= -windowS)}
            tickFormatter={(v: number) => (v === 0 ? 'now' : `${v}s`)}
            stroke="rgba(148,163,184,0.6)"
            fontSize={11}
            tickLine={false}
            allowDataOverflow
          />
          <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} stroke="rgba(148,163,184,0.6)" fontSize={11} tickLine={false} />
          <Tooltip
            isAnimationActive={false}
            contentStyle={{
              background: 'rgba(15,23,42,0.92)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              fontSize: 12,
              color: '#e2e8f0',
            }}
            labelFormatter={(v) => `${Number(v).toFixed(1)} s`}
            formatter={(v) => (typeof v === 'number' ? v.toFixed(3) : String(v))}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
          <ReferenceLine
            y={earThreshold}
            stroke="#f43f5e"
            strokeDasharray="5 5"
            label={{ value: `EAR thr ${earThreshold.toFixed(2)}`, position: 'insideBottomLeft', fill: '#f43f5e', fontSize: 10 }}
          />
          <ReferenceLine
            y={marThreshold}
            stroke="#fbbf24"
            strokeDasharray="5 5"
            label={{ value: `MAR thr ${marThreshold.toFixed(2)}`, position: 'insideTopLeft', fill: '#fbbf24', fontSize: 10 }}
          />
          <Line name="EAR" dataKey="ear" stroke={EAR_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} type="monotone" />
          <Line name="MAR" dataKey="mar" stroke={MAR_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
