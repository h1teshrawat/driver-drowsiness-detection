import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ConnectionProvider } from './context/ConnectionContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ConnectionProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ConnectionProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
