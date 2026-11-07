/**
 * Mirrors `@mm/design-tokens` (packages/design-tokens/src/index.ts). Keep in sync — the token
 * package is ESM-only, so it is not required here to keep this config loadable by any Node.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        canvas: '#F4F2F0',
        card: '#FFFFFF',
        ink: '#0C0A08',
        'ink-soft': '#2A2826',
        'surface-dark': '#1A1919',
        muted: '#6D6C6B',
        subtle: '#9C9A98',
        border: '#E5E7EB',
        'border-strong': '#D4D2CF',
        hover: '#EDEAE7',
        accent: '#E4F222',
        'accent-ink': '#0C0A08',
        'accent-hover': '#D6E40F',
        positive: '#1F7A4D',
        'positive-soft': '#E6F2EA',
        negative: '#B42318',
        'negative-soft': '#FBEAE8',
        warning: '#A15C07',
        'warning-soft': '#FDF1DC',
        info: '#1D4ED8',
        'info-soft': '#E6ECFB',
        projection: '#6D6C6B',
      },
      borderRadius: { button: '6px', input: '10px', card: '14px', 'card-lg': '16px' },
      fontFamily: {
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
      },
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['15px', '22px'],
        lg: ['17px', '24px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '30px'],
        '3xl': ['30px', '36px'],
        display: ['40px', '44px'],
      },
    },
  },
  plugins: [],
};
