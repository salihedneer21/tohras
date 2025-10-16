import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1320px',
      },
    },
    extend: {
      colors: {
        border: 'rgba(255, 255, 255, 0.08)',
        input: '#2b3038',
        ring: 'rgba(58, 122, 254, 0.65)',
        background: '#1b1d23',
        foreground: '#f5f7fb',
        muted: {
          DEFAULT: '#24272f',
          foreground: '#a5adbd',
        },
        accent: {
          DEFAULT: '#3a7afe',
          foreground: '#0c1226',
        },
        popover: {
          DEFAULT: '#22252d',
          foreground: '#f5f7fb',
        },
        card: {
          DEFAULT: '#23262f',
          foreground: '#f5f7fb',
        },
      },
      borderRadius: {
        lg: '1rem',
        md: '0.75rem',
        sm: '0.5rem',
      },
      boxShadow: {
        subtle: '0 8px 24px rgba(2, 6, 23, 0.25)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
