module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: {
          primary: 'var(--background-primary)',
          secondary: 'var(--background-secondary)',
          tertiary: 'var(--background-tertiary)'
        },
        surface: {
          DEFAULT: 'var(--surface)',
          border: 'var(--surface-border)'
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)'
        },
        brand: {
          DEFAULT: 'var(--brand)',
          hover: 'var(--brand-hover)'
        },
        status: {
          green: 'var(--status-green)',
          red: 'var(--status-red)',
          yellow: 'var(--status-yellow)',
          cyan: 'var(--status-cyan)'
        },
        gradient: {
          start: 'var(--brand)',
          mid: 'var(--brand-hover)',
          end: 'var(--status-cyan)'
        }
      },
      fontFamily: { sans: ['Outfit', 'Inter', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
      boxShadow: {
        'card': '0 4px 20px rgba(0, 0, 0, 0.02)',
        'card-hover': '0 8px 30px rgba(124, 58, 237, 0.04), 0 10px 30px rgba(0, 0, 0, 0.04)',
        'glow-green': '0 0 15px rgba(16, 185, 129, 0.1)',
        'glow-red': '0 0 15px rgba(239, 68, 68, 0.1)',
        'glow-cyan': '0 0 15px rgba(14, 165, 233, 0.1)',
        'glow-purple': '0 0 15px rgba(124, 58, 237, 0.1)',
      },
    },
  },
  plugins: [],
};