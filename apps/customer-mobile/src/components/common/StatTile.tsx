import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

export interface StatTileProps {
  label?: string;
  title?: string;
  value: string;
  sublabel?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  color?: string;
  variant?: 'primary' | 'success' | 'danger' | 'cow' | 'buffalo' | 'neutral';
  style?: ViewStyle;
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  title,
  value,
  sublabel,
  subtitle,
  badge,
  icon,
  color,
  variant = 'neutral',
  style,
}) => {
  const displayLabel = label || title;
  const displaySublabel = sublabel || subtitle;

  return (
    <View style={[styles.container, styles[variant], style]}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, color ? { color } : null]}>{displayLabel}</Text>
        {badge || icon}
      </View>
      <Text style={[styles.value, color ? { color } : null]}>{value}</Text>
      {displaySublabel && <Text style={styles.sublabel}>{displaySublabel}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sublabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  primary: {
    borderColor: colors.primaryLight,
  },
  success: {
    borderColor: colors.creditLight,
  },
  danger: {
    borderColor: colors.debitLight,
  },
  cow: {
    borderColor: colors.cowLight,
  },
  buffalo: {
    borderColor: colors.buffaloLight,
  },
  neutral: {
    borderColor: colors.border,
  },
});
