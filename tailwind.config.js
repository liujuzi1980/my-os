/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        glass: {
          100: 'rgba(255,255,255,0.1)',
          200: 'rgba(255,255,255,0.2)',
          300: 'rgba(255,255,255,0.3)',
          400: 'rgba(255,255,255,0.4)',
        }
      },
      backdropBlur: {
        xs: '2px',
      },
      fontFamily: {
        narrative: ['Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STKaiti', 'serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
