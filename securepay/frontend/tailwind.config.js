/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dde6ff',
          200: '#c3d1ff',
          300: '#9db2ff',
          400: '#7488fb',
          500: '#5462f5',
          600: '#4040e8',
          700: '#3531cd',
          800: '#2c2ba4',
          900: '#2a2982',
          950: '#1a1850',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,.06), 0 1px 2px 0 rgba(0,0,0,.04)',
        'card-hover': '0 4px 16px 0 rgba(0,0,0,.10)',
      },
    },
  },
  plugins: [],
};
