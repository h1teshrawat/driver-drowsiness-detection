import { Loader2 } from 'lucide-react'
import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'

// Pages with charts and webcam code are loaded on demand, so the landing page
// downloads quickly and Recharts is only fetched when it is actually needed.
const Monitor = lazy(() => import('./pages/Monitor'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const History = lazy(() => import('./pages/History'))

function PageLoader() {
  return (
    <div className="grid h-64 place-items-center text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="monitor" element={<Monitor />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="history" element={<History />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
