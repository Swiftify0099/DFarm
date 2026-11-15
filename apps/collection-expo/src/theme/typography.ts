import { TextStyle, Platform } from 'react-native';
import { colors } from './colors';

const monoFont = Platform.select({
  ios: 'Courier',
  android: 'monospace',
  default: 'monospace',
});

export const typography = {
  // Existing Typography Tokens (Strictly Preserved)
  headlineLarge: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textPrimary,
    lineHeight: 38,
  } as TextStyle,

  headlineMedium: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    lineHeight: 30,
  } as TextStyle,

  titleLarge: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 26,
  } as TextStyle,

  titleMedium: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 22,
  } as TextStyle,

  bodyLarge: {
    fontSize: 16,
    fontWeight: 'normal',
    color: colors.textPrimary,
    lineHeight: 22,
  } as TextStyle,

  bodyMedium: {
    fontSize: 14,
    fontWeight: 'normal',
    color: colors.textSecondary,
    lineHeight: 20,
  } as TextStyle,

  caption: {
    fontSize: 12,
    fontWeight: 'normal',
    color: colors.textSecondary,
    lineHeight: 16,
  } as TextStyle,

  monospaceReceipt: {
    fontFamily: monoFont,
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 16,
  } as TextStyle,

  // Enhanced Measurement & High-Visibility Terminal Metrics
  displayMetric: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 46,
    letterSpacing: -0.5,
  } as TextStyle,

  displayMetricLarge: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 54,
    letterSpacing: -1,
  } as TextStyle,

  metricUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  } as TextStyle,

  labelBold: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  } as TextStyle,

  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  } as TextStyle,

  captionBold: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 16,
  } as TextStyle,
};
