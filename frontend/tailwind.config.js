/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        custom: {
          bg: '#FAF6EE',
          card: '#FFFDF8',
          textPrimary: '#172033',
          textSecondary: '#64748B',
          accent: '#10B981',
          accentHover: '#059669',
          warning: '#F59E0B',
          destructive: '#EF4444',
          border: '#E2E8F0',
          disabled: '#CBD5E1',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
