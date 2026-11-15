import { colors } from './colors';
import { typography } from './typography';
import { clayStyles, clayRadius, claySpacing, clayColors } from './claymorphism';

export const theme = {
  colors,
  typography,
  borderRadius: {
    xs: 4,
    sm: 8,
    md: 10,
    lg: 12,
    xl: 14,
    card: 20,
    dialog: 24,
    pill: 28,
    circle: 9999,
    clay: clayRadius,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    base: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    clay: claySpacing,
  },
  shadow: {
    card: {
      shadowColor: '#002E44',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    cardHover: {
      shadowColor: '#002E44',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 6,
    },
    bottomBar: {
      shadowColor: '#002E44',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 8,
    },
    clay: clayStyles,
  },
  clay: {
    colors: clayColors,
    styles: clayStyles,
    radius: clayRadius,
    spacing: claySpacing,
  },
};
