import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── Paleta Vistalegre ──────────────────────────────────────────────
      colors: {
        navy:      { DEFAULT: '#002169', dark: '#1F2A44' },
        magenta:   { DEFAULT: '#CF095E', dark: '#A8004A' },
        petrol:    '#004876',
        plum:      '#5E3654',
        burgundy:  '#9B4956',
        coral:     '#EA7267',
        charcoal:  '#222222',
        'dark-grey': '#353740',
        'mid-grey':  '#666666',
        'light-grey': '#9B9B9B',
        'off-white': '#F8F7F7',
        border:    '#DDDDDD',
        'bg-input': '#F4F4F6',
        // Semánticos
        success:   '#1A7A4A',
        danger:    '#D40000',
        warning:   '#F59E0B',
      },

      // ── Tipografía ────────────────────────────────────────────────────
      fontFamily: {
        montserrat: ['var(--font-montserrat)', 'Helvetica', 'Arial', 'sans-serif'],
      },
      fontSize: {
        'xs':   ['11px', { lineHeight: '1.4' }],
        'sm':   ['13px', { lineHeight: '1.5' }],
        'base': ['15px', { lineHeight: '1.5' }],
        'md':   ['17px', { lineHeight: '1.4' }],
        'lg':   ['22px', { lineHeight: '1.3' }],
        'xl':   ['28px', { lineHeight: '1.2' }],
        '2xl':  ['35px', { lineHeight: '1.1' }],
      },

      // ── Bordes redondeados ────────────────────────────────────────────
      borderRadius: {
        'none': '0px',   // Botones CTA (fiel a Vistalegre)
        'sm':   '4px',   // Badges
        'md':   '12px',  // Tarjetas de lista
        'lg':   '20px',  // Tarjetas panel / modales
        'full': '9999px', // Avatares, counters
      },

      // ── Sombras ───────────────────────────────────────────────────────
      boxShadow: {
        'card':     '6px 6px 18px 0px rgba(0, 0, 0, 0.12)',
        'elevated': '0px 12px 18px -6px rgba(0, 0, 0, 0.25)',
        'nav':      '0px 2px 8px 0px rgba(0, 0, 0, 0.10)',
      },

      // ── Altura del Tab Bar y Header ───────────────────────────────────
      height: {
        'tab-bar': 'var(--tab-bar-height)',
        'header':  'var(--header-height)',
      },

      // ── Espaciado seguro (safe areas) ─────────────────────────────────
      padding: {
        'safe-top':    'var(--safe-top)',
        'safe-bottom': 'var(--safe-bottom)',
        'safe-left':   'var(--safe-left)',
        'safe-right':  'var(--safe-right)',
      },

      // ── Animaciones ───────────────────────────────────────────────────
      animation: {
        'pulse-urgent': 'pulse-urgent 1.5s ease-in-out infinite',
        'slide-down':   'slide-down 0.3s ease-out',
        'slide-up':     'slide-up-fade 0.25s ease-out',
      },
      keyframes: {
        'pulse-urgent': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.75', transform: 'scale(1.05)' },
        },
        'slide-down': {
          from: { transform: 'translateY(-100%)', opacity: '0' },
          to:   { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-up-fade': {
          from: { transform: 'translateY(16px)', opacity: '0' },
          to:   { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
