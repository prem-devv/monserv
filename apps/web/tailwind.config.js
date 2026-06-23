module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: {
          primary: 'var(--background-primary)',
          secondary: 'var(--background-secondary)',
          tertiary: 'var(--background-tertiary)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          border: 'var(--surface-border)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          hover: 'var(--brand-hover)',
          soft: 'var(--brand-soft)',
        },
        status: {
          green: 'var(--status-green)',
          red: 'var(--status-red)',
          yellow: 'var(--status-yellow)',
          cyan: 'var(--status-cyan)',
        },
        gradient: {
          start: 'var(--brand)',
          mid: 'var(--brand-hover)',
          end: 'var(--status-cyan)',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        slab: '0 24px 60px -20px rgba(0,0,0,0.6), 0 8px 24px -12px rgba(0,0,0,0.5)',
        'glow-cyan': '0 0 24px -4px rgba(56, 189, 248, 0.45)',
        'glow-green': '0 0 22px -4px rgba(52, 211, 153, 0.4)',
        'glow-red': '0 0 22px -4px rgba(251, 94, 126, 0.4)',
      },
      keyframes: {
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
