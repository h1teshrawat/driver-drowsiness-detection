import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import History from './pages/History'
import Landing from './pages/Landing'
import Monitor from './pages/Monitor'
import NotFound from './pages/NotFound'
import SettingsPage from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="monitor" element={<Monitor />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="history" element={<History />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
