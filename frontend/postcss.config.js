import { fileURLToPath } from 'node:url'

// Point Tailwind at its config explicitly, so the dev server works no matter
// which folder it is started from (e.g. the one-command start script).
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {},
  },
}
