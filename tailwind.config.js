/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        appbg: 'rgb(var(--app-bg-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised-rgb) / <alpha-value>)',
        'editor-bg': 'rgb(var(--editor-bg-rgb) / <alpha-value>)',
        'text-primary': 'rgb(var(--text-primary-rgb) / <alpha-value>)',
        'text-secondary': 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted-rgb) / <alpha-value>)',
        border: 'rgb(var(--border-rgb) / <alpha-value>)',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-hover': 'rgb(var(--accent-hover-rgb) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft-rgb) / <alpha-value>)',
        'on-accent': 'rgb(var(--on-accent-rgb) / <alpha-value>)',
        success: 'rgb(var(--success-rgb) / <alpha-value>)',
        'success-soft': 'rgb(var(--success-soft-rgb) / <alpha-value>)',
        warning: 'rgb(var(--warning-rgb) / <alpha-value>)',
        'warning-soft': 'rgb(var(--warning-soft-rgb) / <alpha-value>)',
        danger: 'rgb(var(--danger-rgb) / <alpha-value>)',
        'danger-soft': 'rgb(var(--danger-soft-rgb) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', '"Microsoft YaHei UI"', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['"Source Han Serif SC"', '"Noto Serif SC"', '"Songti SC"', 'SimSun', 'serif']
      }
    }
  },
  plugins: []
}
