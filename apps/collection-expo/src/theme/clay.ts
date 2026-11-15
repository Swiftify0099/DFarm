import { ViewStyle, StyleSheet } from 'react-native';
import { colors } from './colors';

export const clayBorderRadius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  card: 20,
  cardLarge: 24,
  dialog: 24,
  pill: 9999,
  circle: 9999,
} as const;

export const clayShadows = {
  // Soft raised surface shadow
  raisedSm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    elevation: 4,
  } as ViewStyle,

  // Standard raised card shadow
  raisedMd: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 7,
  } as ViewStyle,

  // Elevated floating modal / hero shadow
  raisedLg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  } as ViewStyle,

  // Soft glow for active states (green)
  glowGreen: {
    shadowColor: colors.clayGreenLight,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  } as ViewStyle,

  // Soft glow for amber warning / accent
  glowAmber: {
    shadowColor: colors.clayAmber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  } as ViewStyle,

  // Soft glow for blue focus / sync
  glowBlue: {
    shadowColor: colors.clayBlueLight,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  } as ViewStyle,
};

export const clayStyles = StyleSheet.create({
  // Raised 3D Clay Card Surface
  card: {
    backgroundColor: colors.claySurfaceCard,
    borderRadius: clayBorderRadius.card,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 2.5,
    borderRightWidth: 1.5,
    borderTopColor: colors.claySurfaceHighlight,
    borderLeftColor: colors.claySurfaceHighlightSoft,
    borderBottomColor: colors.claySurfaceShadow,
    borderRightColor: colors.claySurfaceShadowSubtle,
    ...clayShadows.raisedMd,
  },

  // Raised 3D Green Accent Card (e.g. Primary action hero)
  cardGreen: {
    backgroundColor: colors.primaryGreen,
    borderRadius: clayBorderRadius.card,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 3,
    borderRightWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
    borderLeftColor: 'rgba(255, 255, 255, 0.15)',
    borderBottomColor: '#0D3310',
    borderRightColor: '#0D3310',
    ...clayShadows.raisedMd,
  },

  // Inset / Recessed Surface for inputs, wells, readouts
  inset: {
    backgroundColor: colors.clayInsetBg,
    borderRadius: clayBorderRadius.md,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopColor: colors.clayInsetBorderTop,
    borderLeftColor: colors.clayInsetBorderTop,
    borderBottomColor: colors.clayInsetBorderBottom,
    borderRightColor: colors.clayInsetBorderBottom,
  },

  // Raised Tactile Pill Button (Primary)
  buttonPrimary: {
    backgroundColor: colors.clayGreen,
    borderRadius: clayBorderRadius.lg,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 3,
    borderRightWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.35)',
    borderLeftColor: 'rgba(255, 255, 255, 0.18)',
    borderBottomColor: '#14461B',
    borderRightColor: '#14461B',
    ...clayShadows.raisedSm,
  },

  // Raised Tactile Pill Button (Secondary)
  buttonSecondary: {
    backgroundColor: colors.claySurfaceElevated,
    borderRadius: clayBorderRadius.lg,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 3,
    borderRightWidth: 1.5,
    borderTopColor: colors.claySurfaceHighlight,
    borderLeftColor: colors.claySurfaceHighlightSoft,
    borderBottomColor: '#10141A',
    borderRightColor: '#10141A',
    ...clayShadows.raisedSm,
  },

  // Tactile Outline Button
  buttonOutline: {
    backgroundColor: 'rgba(30, 38, 51, 0.6)',
    borderRadius: clayBorderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.clayGreenLight,
    borderTopColor: 'rgba(129, 199, 132, 0.6)',
    borderBottomColor: 'rgba(27, 94, 32, 0.8)',
  },

  // Tactile Danger Button
  buttonDanger: {
    backgroundColor: colors.clayRed,
    borderRadius: clayBorderRadius.lg,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 3,
    borderRightWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
    borderLeftColor: 'rgba(255, 255, 255, 0.15)',
    borderBottomColor: '#7F1D1D',
    borderRightColor: '#7F1D1D',
    ...clayShadows.raisedSm,
  },

  // Tactile Filter / Selector Chip (Selected)
  chipSelected: {
    backgroundColor: colors.clayGreen,
    borderRadius: clayBorderRadius.pill,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 2.5,
    borderRightWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.35)',
    borderLeftColor: 'rgba(255, 255, 255, 0.18)',
    borderBottomColor: '#14461B',
    borderRightColor: '#14461B',
    ...clayShadows.raisedSm,
  },

  // Tactile Filter / Selector Chip (Unselected)
  chipUnselected: {
    backgroundColor: colors.claySurfaceElevated,
    borderRadius: clayBorderRadius.pill,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderBottomWidth: 1.5,
    borderRightWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderLeftColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomColor: '#10141A',
    borderRightColor: '#10141A',
  },

  // Dialog Container
  dialog: {
    backgroundColor: colors.claySurfaceCard,
    borderRadius: clayBorderRadius.dialog,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 3,
    borderRightWidth: 1.5,
    borderTopColor: colors.claySurfaceHighlight,
    borderLeftColor: colors.claySurfaceHighlightSoft,
    borderBottomColor: colors.claySurfaceShadow,
    borderRightColor: colors.claySurfaceShadowSubtle,
    ...clayShadows.raisedLg,
  },

  // Badge pill
  badgePill: {
    borderRadius: clayBorderRadius.pill,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderBottomWidth: 1.5,
    borderRightWidth: 1,
  },
});
