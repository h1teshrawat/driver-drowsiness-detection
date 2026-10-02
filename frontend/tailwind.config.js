/** @type {import('tailwindcss').Config} */
export default {
  // relative: paths are resolved from this file, not from the current working directory
  content: { relative: true, files: ['./index.html', './src/**/*.{ts,tsx}'] },
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      animation: {
        scan: 'scan 3.5s linear infinite',
      },
    },
  },
  plugins: [],
}
