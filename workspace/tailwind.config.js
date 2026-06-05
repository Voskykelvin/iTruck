/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        lime: {
          50: '#f7fee7',
          100: '#ecfccb',
          200: '#d9f99d',
          300: '#bef264',
          400: '#a3e635',
          500: '#84cc16',
          600: '#65a30d',
          700: '#4d7c0f',
          800: '#3f6212',
          900: '#365314'
        },
        ink: '#132205',
        muted: '#58743a',
        surface: '#ffffff',
        'surface-2': '#f0fdf4'
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
