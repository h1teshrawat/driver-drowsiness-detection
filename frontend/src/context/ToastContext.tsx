import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, Siren, X, type LucideIcon } from 'lucide-react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

export type ToastKind = 'danger' | 'warning' | 'info' | 'success'

export interface ToastInput {
  kind: ToastKind
  title: string
  message?: string
  /** ms before auto-dismiss (default 4500) */
  duration?: number
}

interface Toast extends ToastInput {
  id: number
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null)

const MAX_VISIBLE = 4

const STYLES: Record<ToastKind, { icon: LucideIcon; ring: string; iconColor: string }> = {
  danger: { icon: Siren, ring: 'ring-rose-500/40', iconColor: 'text-rose-500' },
  warning: { icon: AlertTriangle, ring: 'ring-amber-400/40', iconColor: 'text-amber-500' },
  info: { icon: Info, ring: 'ring-sky-400/40', iconColor: 'text-sky-500' },
  success: { icon: CheckCircle2, ring: 'ring-emerald-400/40', iconColor: 'text-emerald-500' },
}

/** Stack of auto-dismissing notifications (bottom-right). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++
      setToasts((list) => [...list, { ...toast, id }].slice(-MAX_VISIBLE))
      window.setTimeout(() => dismiss(id), toast.duration ?? 4500)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const { icon: Icon, ring, iconColor } = STYLES[t.kind]
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 60, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className={clsx(
                  'pointer-events-auto flex items-start gap-3 rounded-xl bg-white/90 p-3.5 shadow-xl ring-1 backdrop-blur-xl dark:bg-slate-900/90',
                  ring,
                )}
              >
                <Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', iconColor)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.title}</p>
                  {t.message && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t.message}</p>}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): (toast: ToastInput) => void {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
