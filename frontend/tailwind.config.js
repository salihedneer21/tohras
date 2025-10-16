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
        border: 'rgba(148, 163, 184, 0.16)',
        input: 'rgba(30, 41, 59, 0.65)',
        ring: 'rgba(99, 102, 241, 0.65)',
        background: '#030712',
        foreground: '#f8fafc',
        muted: {
          DEFAULT: 'rgba(148, 163, 184, 0.15)',
          foreground: '#94a3b8',
        },
        accent: {
          DEFAULT: '#6366f1',
          foreground: '#f8fafc',
        },
        popover: {
          DEFAULT: 'rgba(15, 23, 42, 0.98)',
          foreground: '#f8fafc',
        },
        card: {
          DEFAULT: 'rgba(15, 23, 42, 0.9)',
          foreground: '#f8fafc',
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
