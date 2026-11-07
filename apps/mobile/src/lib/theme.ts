import { colors, radii } from '@mm/design-tokens';

/** Runtime access to design tokens (SVG charts, icons, native props that can't take classes). */
export { colors, radii };

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;
