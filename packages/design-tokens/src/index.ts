/**
 * Money Money design tokens — editorial fintech, light-first.
 *
 * Chartreuse (`accent`) is reserved for primary actions and active states; never for large
 * surfaces or body text. Financial meaning uses `positive`/`negative`/`warning`, never accent.
 */

export const colors = {
  canvas: '#F4F2F0',
  card: '#FFFFFF',
  ink: '#0C0A08',
  inkSoft: '#2A2826',
  surfaceDark: '#1A1919',
  muted: '#6D6C6B',
  subtle: '#9C9A98',
  border: '#E5E7EB',
  borderStrong: '#D4D2CF',
  hover: '#EDEAE7',
  accent: '#E4F222',
  accentInk: '#0C0A08',
  accentHover: '#D6E40F',
  positive: '#1F7A4D',
  positiveSoft: '#E6F2EA',
  negative: '#B42318',
  negativeSoft: '#FBEAE8',
  warning: '#A15C07',
  warningSoft: '#FDF1DC',
  info: '#1D4ED8',
  infoSoft: '#E6ECFB',
  /** Projection lines/areas — visually distinct from actual history. */
  projection: '#6D6C6B',
  projectionSoft: 'rgba(109,108,107,0.10)',
} as const;

/** Dark theme (optional; light is the primary experience). */
export const darkColors: Record<keyof typeof colors, string> = {
  canvas: '#0F0E0D',
  card: '#1A1919',
  ink: '#F4F2F0',
  inkSoft: '#D9D6D3',
  surfaceDark: '#0C0A08',
  muted: '#A3A19F',
  subtle: '#7A7876',
  border: '#2B2A29',
  borderStrong: '#3A3836',
  hover: '#242322',
  accent: '#E4F222',
  accentInk: '#0C0A08',
  accentHover: '#EEF85A',
  positive: '#4ADE80',
  positiveSoft: '#13291C',
  negative: '#F87171',
  negativeSoft: '#2D1513',
  warning: '#FBBF24',
  warningSoft: '#2B210D',
  info: '#93C5FD',
  infoSoft: '#132036',
  projection: '#A3A19F',
  projectionSoft: 'rgba(163,161,159,0.12)',
};

/** Categorical chart palette — muted, distinguishable, colour-blind conscious. */
export const chartPalette = [
  '#0C0A08',
  '#6D8A3A',
  '#3E6FB0',
  '#C2702A',
  '#8B5CF6',
  '#0F8B8D',
  '#B4467A',
  '#7A7876',
] as const;

/** 4px spacing scale. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radii = { button: 6, input: 10, card: 14, cardLarge: 16, pill: 999 } as const;

export const typography = {
  fontFamily: { sans: 'Inter', mono: 'IBM Plex Mono' },
  /** [fontSize, lineHeight] in px. */
  size: {
    xs: [12, 16],
    sm: [13, 18],
    base: [15, 22],
    lg: [17, 24],
    xl: [20, 28],
    '2xl': [24, 30],
    '3xl': [30, 36],
    display: [40, 44],
  },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
  /** Tabular figures for every money value. */
  numeric: 'tabular-nums',
} as const;

export const shadows = {
  none: 'none',
  /** Hairline elevation for popovers/menus only; cards use borders. */
  popover: '0 8px 24px rgba(12,10,8,0.08), 0 1px 2px rgba(12,10,8,0.06)',
} as const;

export const motion = {
  fast: 120,
  base: 180,
  slow: 260,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export const tokens = {
  colors,
  darkColors,
  chartPalette,
  spacing,
  radii,
  typography,
  shadows,
  motion,
} as const;
export type Tokens = typeof tokens;
