/**
 * DFarm Registration App - Typography Tokens
 * Mapped to Kotlin Material 3 Typography & Type.kt
 */

export const typography = {
  fontFamily: undefined, // System font (Roboto on Android)
  monospaceFamily: 'monospace',
  fontSize: {
    xs: 11,
    sm: 12,
    md: 14,
    base: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    display: 32,
  },
  lineHeight: {
    xs: 16,
    sm: 18,
    md: 20,
    base: 24,
    lg: 26,
    xl: 28,
    xxl: 32,
    display: 40,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semiBold: '600' as const,
    bold: '700' as const,
  },
};
