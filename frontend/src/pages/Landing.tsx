import { motion, type Variants } from 'framer-motion'
import { Activity, ArrowRight, BellRing, Camera, ChevronDown, Gauge, ScanFace, ShieldCheck, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'

const STEPS = [
  {
    icon: Camera,
    title: 'Capture',
    text: 'Your browser reads the webcam and streams ~12 compressed frames per second to the local backend over a WebSocket.',
  },
  {
    icon: ScanFace,
    title: 'Detect',
    text: 'MediaPipe Face Mesh locates 468 facial landmarks — eyelids, lips, nose and chin — in every frame.',
  },
  {
    icon: Activity,
    title: 'Analyse',
    text: 'Eye Aspect Ratio, Mouth Aspect Ratio, PERCLOS and head pose are combined into a 0–100 fatigue score.',
  },
  {
    icon: BellRing,
    title: 'Alert',
    text: 'Closed eyes, yawns or nodding trigger a visual and audio alarm instantly, and every event is logged.',
  },
]

const FEATURES = [
  { icon: Timer, label: 'Real-time', value: '< 50 ms', note: 'per-frame analysis' },
  { icon: Gauge, label: 'Signals', value: '5', note: 'EAR · MAR · PERCLOS · pitch · yaw' },
  { icon: ShieldCheck, label: 'Privacy', value: '100%', note: 'local — no cloud, no recordings' },
]

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } }
const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

export default function Landing() {
  return (
    <div className="space-y-24 pt-6 sm:pt-12">
      {/* ---------------- Hero ---------------- */}
      <section className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.p
            variants={item}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-300"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            Computer vision · B.Tech AI/ML minor project
          </motion.p>
          <motion.h1
            variants={item}
            className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
          >
            Real-Time Driver{' '}
            <span className="bg-gradient-to-r from-cyan-500 via-sky-400 to-indigo-400 bg-clip-text text-transparent">
              Drowsiness Detection
            </span>
          </motion.h1>
          <motion.p variants={item} className="mt-6 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg">
            A webcam-based co-pilot that watches for heavy eyelids, yawns and nodding off — and sounds the alarm
            before a micro-sleep turns into an accident.
          </motion.p>
          <motion.div variants={item} className="mt-8 flex flex-wrap gap-3">
            <Link to="/monitor" className="btn-primary px-6 py-3 text-base">
              Start Monitoring <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how-it-works" className="btn-ghost px-6 py-3 text-base">
              How it works <ChevronDown className="h-4 w-4" />
            </a>
          </motion.div>

          <motion.dl variants={item} className="mt-12 grid max-w-xl grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, label, value, note }) => (
              <div key={label}>
                <dt className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Icon className="h-3.5 w-3.5" /> {label}
                </dt>
                <dd className="mt-1 font-display text-2xl font-semibold">{value}</dd>
                <dd className="text-xs text-slate-500 dark:text-slate-500">{note}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <EyeDemo />
        </motion.div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how-it-works" className="scroll-mt-24">
        <div className="mb-10 text-center">
          <p className="label-caps">Pipeline</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">How it works</h2>
        </div>
        <motion.ol
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* connecting line (desktop) */}
          <div className="absolute left-[12%] right-[12%] top-[38px] hidden h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent lg:block" />
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <motion.li key={title} variants={item} whileHover={{ y: -4 }} className="glass relative p-6">
              <div className="mb-5 flex items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-400/15 text-cyan-600 ring-1 ring-cyan-400/30 dark:text-cyan-300">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="font-mono text-sm text-slate-400">0{i + 1}</span>
              </div>
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{text}</p>
            </motion.li>
          ))}
        </motion.ol>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="glass relative overflow-hidden p-8 text-center sm:p-12">
        <div className="absolute inset-x-0 -top-24 mx-auto h-48 w-2/3 rounded-full bg-cyan-400/20 blur-3xl" />
        <h2 className="relative font-display text-2xl font-semibold sm:text-3xl">Ready for a test drive?</h2>
        <p className="relative mx-auto mt-3 max-w-lg text-slate-600 dark:text-slate-400">
          Sit in good light, face the camera, and try closing your eyes for two seconds.
        </p>
        <Link to="/monitor" className="btn-primary relative mt-6 px-6 py-3 text-base">
          Open the live monitor <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  )
}

/** Animated eye with the six EAR landmarks — explains the core metric visually. */
function EyeDemo() {
  // Landmark positions p1..p6 on a 320x200 canvas
  const p = { p1: [60, 100], p2: [125, 58], p3: [195, 58], p4: [260, 100], p5: [195, 142], p6: [125, 142] } as const
  const blink = {
    animate: { scaleY: [1, 1, 0.08, 1, 1] },
    transition: { duration: 4, times: [0, 0.82, 0.88, 0.94, 1], repeat: Infinity, ease: 'easeInOut' as const },
  }

  return (
    <div className="glass relative p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="label-caps">Eye Aspect Ratio</p>
        <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
          ● ALERT
        </span>
      </div>

      <svg viewBox="0 0 320 200" className="w-full">
        <defs>
          <radialGradient id="iris" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0e7490" />
            <stop offset="70%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#164e63" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <motion.g style={{ originX: '50%', originY: '50%' }} {...blink}>
          <path
            d={`M${p.p1[0]},${p.p1[1]} C110,30 210,30 ${p.p4[0]},${p.p4[1]} C210,170 110,170 ${p.p1[0]},${p.p1[1]} Z`}
            className="fill-slate-200 dark:fill-slate-800/80"
            stroke="#22d3ee"
            strokeWidth="2.5"
            filter="url(#glow)"
          />
          <circle cx="160" cy="100" r="34" fill="url(#iris)" />
          <circle cx="160" cy="100" r="13" className="fill-slate-950" />
          <circle cx="170" cy="90" r="5" fill="white" opacity="0.8" />

          {/* vertical distances */}
          <line x1={p.p2[0]} y1={p.p2[1]} x2={p.p6[0]} y2={p.p6[1]} stroke="#34d399" strokeWidth="1.5" strokeDasharray="4 4" />
          <line x1={p.p3[0]} y1={p.p3[1]} x2={p.p5[0]} y2={p.p5[1]} stroke="#34d399" strokeWidth="1.5" strokeDasharray="4 4" />
        </motion.g>
        {/* horizontal distance */}
        <line x1={p.p1[0]} y1={p.p1[1]} x2={p.p4[0]} y2={p.p4[1]} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 4" />

        {Object.entries(p).map(([name, [x, y]]) => (
          <g key={name}>
            <circle cx={x} cy={y} r="4.5" fill="#22d3ee" filter="url(#glow)" />
            <text
              x={x + (name === 'p1' ? -26 : name === 'p4' ? 10 : -8)}
              y={y + (['p2', 'p3'].includes(name) ? -12 : ['p5', 'p6'].includes(name) ? 22 : 4)}
              className="fill-slate-500 font-mono text-[12px] dark:fill-slate-400"
            >
              {name}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-4 rounded-xl bg-slate-900/[0.04] p-4 text-center font-mono text-sm dark:bg-white/[0.04]">
        EAR = (<span className="text-emerald-500">|p2−p6| + |p3−p5|</span>) / (2 ×{' '}
        <span className="text-amber-500">|p1−p4|</span>)
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-center text-xs">
        <div className="rounded-lg bg-emerald-400/10 py-2 text-emerald-700 dark:text-emerald-300">
          Open eye ≈ <b>0.30</b>
        </div>
        <div className="rounded-lg bg-rose-400/10 py-2 text-rose-700 dark:text-rose-300">
          Closed eye &lt; <b>0.15</b>
        </div>
      </div>
    </div>
  )
}
