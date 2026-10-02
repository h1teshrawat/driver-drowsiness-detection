import { AnimatePresence, motion } from 'framer-motion'
import { BellOff, Siren } from 'lucide-react'
import { createPortal } from 'react-dom'

interface Props {
  active: boolean
  onDismiss: () => void
}

/**
 * Full-screen flashing red border + "WAKE UP" banner while the driver is drowsy.
 * Rendered into <body> via a portal so animated (transformed) parents can't
 * break its `position: fixed`.
 */
export default function AlarmOverlay({ active, onDismiss }: Props) {
  return createPortal(
    <AnimatePresence>
      {active && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="alertdialog"
          aria-live="assertive"
          aria-label="Drowsiness alarm"
        >
          {/* flashing border */}
          <motion.div
            className="absolute inset-0"
            style={{
              boxShadow: 'inset 0 0 0 10px #f43f5e, inset 0 0 160px 40px rgba(244,63,94,0.55)',
            }}
            animate={{ opacity: [1, 0.15, 1] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          />
          {/* banner */}
          <div className="absolute inset-x-0 top-20 flex justify-center px-4">
            <motion.div
              initial={{ y: -30, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              className="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl bg-rose-600/95 px-8 py-5 text-center text-white shadow-[0_0_80px_-10px_rgba(244,63,94,0.9)] ring-2 ring-white/30 backdrop-blur sm:flex-row sm:text-left"
            >
              <motion.span animate={{ rotate: [-12, 12, -12] }} transition={{ duration: 0.4, repeat: Infinity }}>
                <Siren className="h-10 w-10" />
              </motion.span>
              <div>
                <p className="font-display text-2xl font-bold tracking-tight sm:text-3xl">DROWSY – WAKE UP!</p>
                <p className="text-sm text-rose-100">Your eyes have been closed too long. Pull over and take a break.</p>
              </div>
              <button
                onClick={onDismiss}
                className="btn ml-0 bg-white text-rose-600 hover:bg-rose-50 sm:ml-4"
                autoFocus
              >
                <BellOff className="h-4 w-4" /> Dismiss
              </button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
