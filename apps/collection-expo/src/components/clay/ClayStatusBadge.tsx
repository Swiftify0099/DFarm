import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { clayBorderRadius } from '../../theme/clay';

export interface ClayStatusBadgeProps {
  status: string;
  label?: string;
  variant?: 'active' | 'pending' | 'draft' | 'suspended' | 'synced' | 'offline' | 'default';
  style?: ViewStyle;
}

export const ClayStatusBadge: React.FC<ClayStatusBadgeProps> = ({
  status,
  label,
  variant,
  style,
}) => {
  const normalized = (variant || status).toUpperCase();

  const getBadgeColors = (): { bg: string; text: string; border: string } => {
    switch (normalized) {
      case 'ACTIVE':
      case 'SYNCED':
        return {
          bg: colors.statusActiveBg,
          text: colors.statusActiveText,
          border: 'rgba(19, 115, 51, 0.35)',
        };
      case 'PENDING':
        return {
          bg: colors.statusPendingBg,
          text: colors.statusPendingText,
          border: 'rgba(26, 115, 232, 0.35)',
        };
      case 'OFFLINE':
      case 'DRAFT':
        return {
          bg: colors.statusDraftBg,
          text: colors.statusDraftText,
          border: 'rgba(176, 96, 0, 0.35)',
        };
      case 'SUSPENDED':
      case 'ERROR':
        return {
          bg: colors.statusSuspendedBg,
          text: colors.statusSuspendedText,
          border: 'rgba(197, 34, 31, 0.35)',
        };
      default:
        return {
          bg: colors.statusDefaultBg,
          text: colors.statusDefaultText,
          border: 'rgba(95, 99, 104, 0.35)',
        };
    }
  };

  const badgeColor = getBadgeColors();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: badgeColor.bg,
          borderColor: badgeColor.border,
        },
        style,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: badgeColor.text }]} />
      <Text style={[styles.text, { color: badgeColor.text }]}>
        {label || status.toUpperCase()}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: clayBorderRadius.pill,
    borderWidth: 1.5,
    gap: 6,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
