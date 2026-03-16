import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'dv': {
          // Theme-aware — CSS variables (RGB channels)
          'bg':            'rgb(var(--dv-bg) / <alpha-value>)',
          'bg-secondary':  'rgb(var(--dv-bg-secondary) / <alpha-value>)',
          'surface':       'rgb(var(--dv-surface) / <alpha-value>)',
          'elevated':      'rgb(var(--dv-elevated) / <alpha-value>)',
          'elevated-2':    'rgb(var(--dv-elevated-2) / <alpha-value>)',
          'border':        'var(--dv-border)',
          'border-subtle': 'var(--dv-border-subtle)',
          'text':          'rgb(var(--dv-text) / <alpha-value>)',
          'text-secondary':'rgb(var(--dv-text-secondary) / <alpha-value>)',
          'text-muted':    'rgb(var(--dv-text-muted) / <alpha-value>)',
          // iOS system colors — theme-aware
          'accent':        'rgb(var(--dv-accent) / <alpha-value>)',
          'accent-hover':  'rgb(var(--dv-accent-hover) / <alpha-value>)',
          'accent-subtle': 'var(--dv-accent-subtle)',
          'success':       'rgb(var(--dv-success) / <alpha-value>)',
          'warning':       'rgb(var(--dv-warning) / <alpha-value>)',
          'error':         'rgb(var(--dv-error) / <alpha-value>)',
          'purple':        'rgb(var(--dv-purple) / <alpha-value>)',
          'pink':          'rgb(var(--dv-pink) / <alpha-value>)',
          'cyan':          'rgb(var(--dv-cyan) / <alpha-value>)',
          'orange':        'rgb(var(--dv-orange) / <alpha-value>)',
          'teal':          'rgb(var(--dv-teal) / <alpha-value>)',
          'indigo':        'rgb(var(--dv-indigo) / <alpha-value>)',
          'mint':          'rgb(var(--dv-mint) / <alpha-value>)',
        },
      },
      fontFamily: {
        'display': ['var(--font-dm-sans)', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        'mono':    ['var(--font-jetbrains-mono)', 'SF Mono', 'Fira Code', 'monospace'],
        'sans':    ['var(--font-dm-sans)', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'ios-title1':   ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'ios-title2':   ['1.375rem', { lineHeight: '1.25', letterSpacing: '-0.015em', fontWeight: '700' }],
        'ios-title3':   ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'ios-headline': ['1.0625rem', { lineHeight: '1.4', letterSpacing: '-0.005em', fontWeight: '600' }],
        'ios-body':     ['1rem', { lineHeight: '1.5', letterSpacing: '-0.003em' }],
        'ios-callout':  ['0.9375rem', { lineHeight: '1.45' }],
        'ios-subhead':  ['0.875rem', { lineHeight: '1.45', letterSpacing: '-0.005em' }],
        'ios-footnote': ['0.8125rem', { lineHeight: '1.45' }],
        'ios-caption1': ['0.75rem', { lineHeight: '1.4' }],
        'ios-caption2': ['0.6875rem', { lineHeight: '1.35' }],
        'display-xl': ['3.5rem',  { lineHeight: '1.08', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-lg': ['2.75rem', { lineHeight: '1.1',  letterSpacing: '-0.025em', fontWeight: '700' }],
        'display-md': ['2rem',    { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '600' }],
        'display-sm': ['1.5rem',  { lineHeight: '1.2',  letterSpacing: '-0.015em', fontWeight: '600' }],
      },
      borderRadius: {
        'ios':    '0.875rem',
        'ios-lg': '1.25rem',
        'ios-xl': '1.75rem',
      },
      animation: {
        'ios-spring':   'ios-spring 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'ios-fade':     'ios-fade 0.35s ease-out',
        'ios-slide-up': 'ios-slide-up 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'ios-bounce':   'ios-bounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'ios-scale':    'ios-scale 0.25s ease-out',
        'glow':         'glow 3s ease-in-out infinite alternate',
        'float':        'float 6s ease-in-out infinite',
        'pulse-slow':   'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':      'shimmer 2s linear infinite',
        'spin-slow':    'spin 3s linear infinite',
        'gradient-x':   'gradient-x 3s ease infinite',
      },
      keyframes: {
        'ios-spring': {
          '0%':   { transform: 'scale(0.92)', opacity: '0' },
          '50%':  { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'ios-fade': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'ios-slide-up': {
          '0%':   { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'ios-bounce': {
          '0%':   { transform: 'scale(0.9)', opacity: '0' },
          '60%':  { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'ios-scale': {
          '0%':   { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        glow: {
          '0%':   { boxShadow: '0 0 20px rgba(10,132,255,0.15)' },
          '100%': { boxShadow: '0 0 50px rgba(10,132,255,0.3)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-20px)' },
        },
        shimmer: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
      },
      backgroundImage: {
        'ios-mesh': 'radial-gradient(at 40% 20%, rgba(10,132,255,0.08) 0px, transparent 50%), radial-gradient(at 80% 80%, rgba(191,90,242,0.06) 0px, transparent 50%)',
      },
      boxShadow: {
        'ios-sm':    '0 1px 3px rgba(0,0,0,0.3)',
        'ios':       '0 2px 8px rgba(0,0,0,0.32), 0 0 1px rgba(0,0,0,0.24)',
        'ios-lg':    '0 8px 32px rgba(0,0,0,0.4), 0 0 1px rgba(0,0,0,0.2)',
        'ios-xl':    '0 16px 48px rgba(0,0,0,0.5)',
        'ios-glow':  '0 0 20px rgba(10,132,255,0.2)',
        'glow-sm':   '0 0 10px rgba(10,132,255,0.15)',
        'glow':      '0 0 20px rgba(10,132,255,0.2)',
        'glow-lg':   '0 0 40px rgba(10,132,255,0.3)',
        'elevated':  '0 8px 32px rgba(0,0,0,0.4)',
        'card':      '0 1px 3px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.2)',
      },
      backdropBlur: {
        'ios': '40px',
        'ios-heavy': '80px',
      },
    },
  },
  plugins: [],
}

export default config

