/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Inter',
          'Segoe UI',
          'Roboto',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        // Paleta corporativa — acento principal VERDE #10D451
        brand: {
          50: '#e7fbef',
          100: '#c5f6d8',
          200: '#8fedb4',
          300: '#52e089',
          400: '#26d968',
          500: '#10D451', // VERDE corporativo
          600: '#0cb544',
          700: '#0a9038',
          800: '#0b722f',
          900: '#0a5d28',
        },
        // MAGENTA corporativo #B33D9E
        magenta: {
          50: '#faeef7',
          100: '#f3d6ec',
          200: '#e7add9',
          300: '#d97fc3',
          400: '#c65aae',
          500: '#B33D9E', // MAGENTA corporativo
          600: '#993285',
          700: '#7d2a6d',
          800: '#642357',
          900: '#4f1c45',
        },
        // Corporate named tokens
        corp: {
          green: '#10D451',   // VERDE
          magenta: '#B33D9E', // MAGENTA
          light: '#E0EBE7',   // CINZA Claro
          medium: '#A1ADAD',  // CINZA Médio
          white: '#FFFFFF',   // PRETO (branco)
        },
        ink: {
          50: '#f5f7f6', // gris muy claro
          100: '#E0EBE7', // CINZA Claro corporativo
          200: '#c7d3cf',
          300: '#A1ADAD', // CINZA Médio corporativo
          400: '#86908f',
          500: '#6a7473',
          600: '#48504f',
          700: '#2c3130',
          800: '#1c201f',
          900: '#000000',
        },
        success: '#10D451',
        warning: '#ff9f0a',
        danger: '#ff453a',
        info: '#B33D9E',
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
        'card-hover': '0 2px 6px rgba(0,0,0,0.06), 0 16px 40px rgba(0,0,0,0.10)',
        glass: '0 8px 32px rgba(0,0,0,0.12)',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'scan-line': {
          '0%': { top: '0%' },
          '50%': { top: '100%' },
          '100%': { top: '0%' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'slide-up': 'slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'scan-line': 'scan-line 2.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
