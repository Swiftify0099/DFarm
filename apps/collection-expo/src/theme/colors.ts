/**
 * DFarm Milk Collection App - Claymorphic Color System
 * Preserves 100% of existing tokens while providing rich 3D tactile clay tokens
 * and semantic parity with Registration Expo.
 */

export const colors = {
  // Existing Tokens (Preserved strictly for zero regressions)
  primaryGreen: '#1B5E20',
  primaryLight: '#4C8C4A',
  accentAmber: '#FF8F00',
  backgroundDark: '#121212',
  surfaceDark: '#1E1E1E',
  cardBackground: '#2C2C2C',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0BEC5',
  statusValid: '#4CAF50',
  statusError: '#E53935',
  statusWarning: '#FFA000',
  borderDark: '#333333',
  inputBorder: '#444444',
  chipUnselected: '#242424',

  // Claymorphic Surface Tokens (Tactile 3D Palette)
  clayBgDark: '#0F1318',
  claySurface: '#19202A',
  claySurfaceElevated: '#222C3A',
  claySurfaceCard: '#1E2633',
  claySurfaceHighlight: 'rgba(255, 255, 255, 0.14)',
  claySurfaceHighlightSoft: 'rgba(255, 255, 255, 0.08)',
  claySurfaceShadow: 'rgba(0, 0, 0, 0.45)',
  claySurfaceShadowSubtle: 'rgba(0, 0, 0, 0.25)',
  clayInsetBg: '#131821',
  clayInsetBorderTop: 'rgba(0, 0, 0, 0.50)',
  clayInsetBorderBottom: 'rgba(255, 255, 255, 0.12)',

  // Tactile Brand Clay Accents
  clayGreen: '#2E7D32',
  clayGreenLight: '#4CAF50',
  clayGreenDark: '#1B5E20',
  clayGreenContainer: 'rgba(46, 125, 50, 0.25)',
  clayGreenBorder: '#388E3C',

  clayAmber: '#FF8F00',
  clayAmberLight: '#FFA000',
  clayAmberContainer: 'rgba(255, 143, 0, 0.22)',
  clayAmberBorder: '#FFB300',

  clayBlue: '#0288D1',
  clayBlueLight: '#29B6F6',
  clayBlueContainer: 'rgba(2, 136, 209, 0.22)',
  clayBlueBorder: '#03A9F4',

  clayRed: '#D32F2F',
  clayRedLight: '#EF5350',
  clayRedContainer: 'rgba(211, 47, 47, 0.25)',
  clayRedBorder: '#E53935',

  clayPurple: '#7B1FA2',
  clayPurpleContainer: 'rgba(123, 31, 162, 0.22)',

  // Registration Expo Parity Tokens
  primary: '#00506E',
  onPrimary: '#FFFFFF',
  primaryContainer: '#23759B',
  onPrimaryContainer: '#FFFFFF',
  secondary: '#486271',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#CFEAFD',
  onSecondaryContainer: '#344D5C',

  // Status Badge Colors (DisplayComponents.kt / Registration Expo parity)
  statusActiveBg: '#E6F4EA',
  statusActiveText: '#137333',
  statusDraftBg: '#FEF7E0',
  statusDraftText: '#B06000',
  statusPendingBg: '#E8F0FE',
  statusPendingText: '#1A73E8',
  statusSuspendedBg: '#FCE8E6',
  statusSuspendedText: '#C5221F',
  statusDefaultBg: '#F1F3F4',
  statusDefaultText: '#5F6368',

  // Milk Category Badge Colors (Registration Expo parity)
  categoryCowBg: '#FFF3E0',
  categoryCowText: '#E65100',
  categoryBuffaloBg: '#ECEFF1',
  categoryBuffaloText: '#37474F',
  categoryBothBg: '#F3E5F5',
  categoryBothText: '#6A1B9A',

  // Hardware HUD Colors
  darkBackground: '#121212',
  darkSurface: '#1E1E1E',
  hudGreen: '#4CAF50',
  hudGreenLight: '#81C784',
  hudGreenBg: 'rgba(76, 175, 80, 0.2)',
  hudAmber: '#FF9800',
  hudRed: '#F44336',
  hudRedLight: '#E57373',
  hudRedBg: 'rgba(244, 67, 54, 0.2)',
  hudTextWhite: '#FFFFFF',
  hudTextMuted: '#9E9E9E',

  // Neutrals
  white: '#FFFFFF',
  black: '#000000',
  borderLight: '#E0E0E0',
  cardShadow: '#000000',
} as const;

export type ColorTokens = typeof colors;
