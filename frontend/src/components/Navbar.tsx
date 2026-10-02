import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, History, Home, Menu, MonitorPlay, Settings, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import ConnectionIndicator from './ConnectionIndicator'
import ThemeToggle from './ThemeToggle'

const LINKS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/monitor', label: 'Live Monitor', icon: MonitorPlay },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/history', label: 'History', icon: History },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname]) // close mobile menu on navigation

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#05070d]/70">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="group flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/15 text-cyan-500 ring-1 ring-cyan-400/30 transition group-hover:shadow-[0_0_20px_-2px_rgba(34,211,238,0.6)] dark:text-cyan-300">
            <Eye className="h-5 w-5" />
          </span>
          <span className="font-display text-base font-semibold tracking-tight">
            Drowsi<span className="text-cyan-500 dark:text-cyan-300">Guard</span>
          </span>
        </Link>

        <ul className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-4 w-4" />
                    {label}
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 -z-10 rounded-lg bg-slate-900/5 ring-1 ring-slate-900/10 dark:bg-white/[0.06] dark:ring-white/10"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <ConnectionIndicator />
          <ThemeToggle />
          <button
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-900/5 md:hidden dark:text-slate-300 dark:hover:bg-white/5"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-200/70 px-4 md:hidden dark:border-white/[0.06]"
          >
            {LINKS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 py-3 text-sm font-medium',
                      isActive ? 'text-cyan-600 dark:text-cyan-300' : 'text-slate-600 dark:text-slate-300',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </header>
  )
}
