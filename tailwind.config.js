/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark slate / gunmetal base
        slate: {
          950: '#05070b',
          900: '#0a0e14',
          850: '#0e131c',
          800: '#121926',
          700: '#1b2536',
          600: '#26334a',
        },
        // Faction accents
        coalition: { DEFAULT: '#22d3ee', dim: '#0e7490', glow: 'rgba(34,211,238,0.5)' },
        syndicate: { DEFAULT: '#ef4444', dim: '#991b1b', glow: 'rgba(239,68,68,0.5)' },
        insurgent: { DEFAULT: '#f59e0b', dim: '#92400e', glow: 'rgba(245,158,11,0.5)' },
        // UI accents
        holo: { DEFAULT: '#4ade80', glow: 'rgba(74,222,128,0.4)' },
        danger: '#f43f5e',
        warning: '#f59e0b',
      },
      fontFamily: {
        // Sharp geometric typography. Falls back to system fonts when offline.
        display: ['Rajdhani', 'Orbitron', 'system-ui', 'sans-serif'],
        mono: ['"Share Tech Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 12px rgba(34,211,238,0.45)',
        'glow-red': '0 0 12px rgba(239,68,68,0.45)',
        'glow-amber': '0 0 12px rgba(245,158,11,0.45)',
        'inset-panel': 'inset 0 0 24px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'radar-grid':
          'linear-gradient(rgba(74,222,128,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,0.05) 1px, transparent 1px)',
      },
      backgroundSize: {
        'radar-grid': '32px 32px',
      },
      keyframes: {
        'scan-sweep': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'flicker': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'scan-sweep': 'scan-sweep 4s linear infinite',
        flicker: 'flicker 3s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};