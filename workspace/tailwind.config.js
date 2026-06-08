/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f8f5e8',
          100: '#ede8d0',
          200: '#cdd5c6',
          300: '#8fa797',
          400: '#4d7f65',
          500: '#0b5a3f',
          600: '#06402b',
          700: '#053622',
          800: '#032d1f',
          900: '#021f15'
        },
        mustard: '#ffce1b',
        beige: '#ede8d0',
        ink: '#07251a',
        muted: '#5f7168',
        surface: '#ffffff',
        'surface-2': '#f3eedb'
      },
      fontFamily: {
        main: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace']
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '6px'
      }
    }
  },
  plugins: []
};
