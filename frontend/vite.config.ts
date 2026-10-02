import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server proxies /api and /ws to FastAPI, so the browser only ever
// talks to one origin (http://localhost:5173): no CORS issues, no hard-coded ports.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
})
