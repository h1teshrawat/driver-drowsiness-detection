import { motion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'

/** Page shell: decorative background, navbar, animated page content. */
export default function Layout() {
  const { pathname } = useLocation()

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Background glows + grid */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="bg-hud-grid absolute inset-0" />
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px] dark:bg-cyan-500/[0.12]" />
        <div className="absolute -bottom-40 -right-40 h-[420px] w-[520px] rounded-full bg-indigo-500/10 blur-[120px]" />
      </div>

      <Navbar />

      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8"
      >
        <Outlet />
      </motion.main>
    </div>
  )
}
