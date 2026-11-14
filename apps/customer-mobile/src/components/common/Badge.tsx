import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors } from '../theme/colors';

export interface BadgeProps {
  label: string;
  variant?:
    | 'primary'
    | 'success'
    | 'danger'
    | 'warning'
    | 'cow'
    | 'buffalo'
    | 'neutral'
    | 'shift'
    | 'info'
    | 'credit'
    | 'debit'
    | 'settled';
  size?: 'sm' | 'md';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'neutral',
  size = 'md',
  style,
  textStyle,
}) => {
  return (
    <View style={[styles.base, styles[size], styles[variant] || styles.neutral, style]}>
      <Text
        style={[
          styles.textBase,
          styles[`text_${size}` as keyof typeof styles] as TextStyle,
          styles[`text_${variant}` as keyof typeof styles] as TextStyle,
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sm: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  md: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  primary: {
    backgroundColor: colors.primaryMuted,
  },
  success: {
    backgroundColor: colors.creditLight,
  },
  credit: {
    backgroundColor: colors.creditLight,
  },
  danger: {
    backgroundColor: colors.debitLight,
  },
  debit: {
    backgroundColor: colors.debitLight,
  },
  warning: {
    backgroundColor: colors.warningLight,
  },
  cow: {
    backgroundColor: colors.cowLight,
  },
  buffalo: {
    backgroundColor: colors.buffaloLight,
  },
  shift: {
    backgroundColor: colors.morningLight,
  },
  info: {
    backgroundColor: '#DBEAFE',
  },
  settled: {
    backgroundColor: '#F1F5F9',
  },
  neutral: {
    backgroundColor: colors.surfaceSubtle,
  },
  textBase: {
    fontWeight: '600',
  },
  text_sm: {
    fontSize: 10,
  },
  text_md: {
    fontSize: 12,
  },
  text_primary: {
    color: colors.primaryDark,
  },
  text_success: {
    color: colors.credit,
  },
  text_credit: {
    color: colors.credit,
  },
  text_danger: {
    color: colors.debit,
  },
  text_debit: {
    color: colors.debit,
  },
  text_warning: {
    color: colors.warning,
  },
  text_cow: {
    color: colors.cow,
  },
  text_buffalo: {
    color: colors.buffalo,
  },
  text_shift: {
    color: colors.morning,
  },
  text_info: {
    color: '#1D4ED8',
  },
  text_settled: {
    color: '#475569',
  },
  text_neutral: {
    color: colors.textSecondary,
  },
});
