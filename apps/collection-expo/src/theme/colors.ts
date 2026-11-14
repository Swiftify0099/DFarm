export const colors = {
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
} as const;

export type ColorTokens = typeof colors;
