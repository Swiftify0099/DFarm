/**
 * DFarm Registration App - Claymorphism Design System Tokens & Styles
 * 
 * Provides tactile, inflated 3D clay visual aesthetics with:
 * - Dual layered soft shadows & diffused highlights
 * - Sculpted raised cards and soft recessed inset surfaces
 * - Beveled tactile action buttons with subtle press compression
 * - Harmonious pastel palette adhering to DFarm's authoritative #00506E brand identity
 */

import { ViewStyle, TextStyle, Platform } from 'react-native';

export const clayColors = {
  // Brand Clay Palette
  primary: '#00506E',
  primaryLight: '#1C7498',
  primaryGlow: 'rgba(0, 80, 110, 0.28)',
  primarySoft: '#E1F0F7',
  onPrimary: '#FFFFFF',

  secondary: '#486271',
  secondaryLight: '#627D8D',
  secondarySoft: '#E6EFF4',
  onSecondary: '#FFFFFF',

  // 3D Clay Canvas & Surfaces
  canvasBackground: '#EDF3F8',
  surfaceRaised: '#FFFFFF',
  surfaceRaisedSoft: '#F6FAFD',
  surfaceCard: '#FFFFFF',
  surfaceInset: '#E2ECF3',
  surfaceInsetDeep: '#D5E3EC',
  surfaceModal: '#FFFFFF',

  // Tactile Clay Rim & Bevel Highlights
  highlightRim: 'rgba(255, 255, 255, 0.95)',
  highlightSubtle: 'rgba(255, 255, 255, 0.65)',
  shadowRim: 'rgba(0, 40, 65, 0.08)',
  shadowRimDark: 'rgba(0, 30, 50, 0.18)',

  // Semantic Feedback Surfaces
  success: '#137333',
  successLight: '#2BA64F',
  successSurface: '#E6F6EC',
  successBorder: '#BCE8CA',
  onSuccess: '#FFFFFF',

  warning: '#B06000',
  warningLight: '#E88B00',
  warningSurface: '#FEF7E6',
  warningBorder: '#F9DFAC',
  onWarning: '#FFFFFF',

  error: '#BA1A1A',
  errorLight: '#DE3B3B',
  errorSurface: '#FDECEC',
  errorBorder: '#F9C2C2',
  onError: '#FFFFFF',

  // Milk Category Tactile Accents
  categoryCow: '#E65100',
  categoryCowBg: '#FFF1E5',
  categoryCowBorder: '#FED7B8',
  categoryBuffalo: '#37474F',
  categoryBuffaloBg: '#E8ECEE',
  categoryBuffaloBorder: '#CFD8DC',
  categoryBoth: '#6A1B9A',
  categoryBothBg: '#F5E8FB',
  categoryBothBorder: '#E1BEE7',

  // Typography Tokens
  textPrimary: '#141C22',
  textSecondary: '#475662',
  textMuted: '#7A8C99',
  textInverse: '#FFFFFF',

  // Decorative Shapes
  shapeCircle: '#D8E8F2',
  shapePill: '#E3EFF7',
};

export const clayRadius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  card: 24,
  dialog: 28,
  pill: 999,
  circle: 9999,
};

export const claySpacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const clayStyles = {
  // Raised Clay Card with Top Highlight Bevel & Diffuse Bottom Shadow
  cardRaised: {
    backgroundColor: clayColors.surfaceRaised,
    borderRadius: clayRadius.card,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2,
    borderTopColor: clayColors.highlightRim,
    borderLeftColor: clayColors.highlightSubtle,
    borderRightColor: clayColors.shadowRim,
    borderBottomColor: clayColors.shadowRim,
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
      android: {
        elevation: 6,
      },
      default: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
    }),
  } as ViewStyle,

  // Floating Elevated Hero Clay Card (for modals, headers, review summaries)
  cardElevated: {
    backgroundColor: clayColors.surfaceRaised,
    borderRadius: clayRadius.dialog,
    borderTopWidth: 2,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 3,
    borderTopColor: clayColors.highlightRim,
    borderLeftColor: clayColors.highlightSubtle,
    borderRightColor: clayColors.shadowRim,
    borderBottomColor: clayColors.shadowRimDark,
    ...Platform.select({
      ios: {
        shadowColor: '#00283C',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
      default: {
        shadowColor: '#00283C',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
      },
    }),
  } as ViewStyle,

  // Recessed Inset Clay Surface (for inputs, text boxes, recessed status panels)
  surfaceInset: {
    backgroundColor: clayColors.surfaceInset,
    borderRadius: clayRadius.md,
    borderTopWidth: 2,
    borderLeftWidth: 1.5,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#C4D6E2',
    borderLeftColor: '#C9DAE5',
    borderRightColor: clayColors.highlightRim,
    borderBottomColor: clayColors.highlightRim,
  } as ViewStyle,

  // Primary 3D Raised Clay Action Button
  buttonPrimary: {
    backgroundColor: clayColors.primary,
    borderRadius: clayRadius.lg,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: 'rgba(255, 255, 255, 0.38)',
    borderLeftColor: 'rgba(255, 255, 255, 0.22)',
    borderRightColor: 'rgba(0, 30, 45, 0.25)',
    borderBottomColor: 'rgba(0, 25, 40, 0.45)',
    ...Platform.select({
      ios: {
        shadowColor: clayColors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
      default: {
        shadowColor: clayColors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
    }),
  } as ViewStyle,

  // Secondary 3D Raised Clay Button
  buttonSecondary: {
    backgroundColor: clayColors.secondarySoft,
    borderRadius: clayRadius.lg,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: clayColors.highlightRim,
    borderLeftColor: clayColors.highlightSubtle,
    borderRightColor: '#BDCFDB',
    borderBottomColor: '#A8BDCB',
    ...Platform.select({
      ios: {
        shadowColor: '#002B40',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      default: {
        shadowColor: '#002B40',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
    }),
  } as ViewStyle,

  // Inset Outlined Tactile Button
  buttonOutlined: {
    backgroundColor: 'transparent',
    borderRadius: clayRadius.lg,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: '#BDD0DE',
  } as ViewStyle,

  // Destructive Raised Clay Button
  buttonDestructive: {
    backgroundColor: clayColors.error,
    borderRadius: clayRadius.lg,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    borderLeftColor: 'rgba(255, 255, 255, 0.25)',
    borderRightColor: 'rgba(80, 0, 0, 0.25)',
    borderBottomColor: 'rgba(60, 0, 0, 0.45)',
    ...Platform.select({
      ios: {
        shadowColor: clayColors.error,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
      default: {
        shadowColor: clayColors.error,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
    }),
  } as ViewStyle,

  // Tactile Pill Badge
  pillBadge: {
    borderRadius: clayRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.7)',
    borderLeftColor: 'rgba(255, 255, 255, 0.4)',
    borderRightColor: 'rgba(0, 0, 0, 0.06)',
    borderBottomColor: 'rgba(0, 0, 0, 0.12)',
  } as ViewStyle,

  // Tactile Floating Action Button (FAB)
  fabRaised: {
    backgroundColor: clayColors.primary,
    borderRadius: clayRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 15,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: 'rgba(255, 255, 255, 0.45)',
    borderLeftColor: 'rgba(255, 255, 255, 0.25)',
    borderRightColor: 'rgba(0, 30, 45, 0.25)',
    borderBottomColor: 'rgba(0, 20, 35, 0.5)',
    ...Platform.select({
      ios: {
        shadowColor: clayColors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 14,
      },
      android: {
        elevation: 8,
      },
      default: {
        shadowColor: clayColors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 14,
      },
    }),
  } as ViewStyle,
};
