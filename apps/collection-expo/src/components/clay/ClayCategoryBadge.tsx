import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { clayBorderRadius } from '../../theme/clay';
import { MilkCategory } from '../../types';

export interface ClayCategoryBadgeProps {
  category: MilkCategory | 'BOTH' | string;
  style?: ViewStyle;
  size?: 'sm' | 'md' | 'lg';
}

export const ClayCategoryBadge: React.FC<ClayCategoryBadgeProps> = ({
  category,
  style,
  size = 'md',
}) => {
  const norm = category.toUpperCase();

  const getConfig = () => {
    switch (norm) {
      case 'COW':
        return {
          label: 'COW MILK',
          icon: '🐄',
          bg: colors.categoryCowBg,
          text: colors.categoryCowText,
          border: 'rgba(230, 81, 0, 0.4)',
        };
      case 'BUFFALO':
        return {
          label: 'BUFFALO MILK',
          icon: '🐃',
          bg: colors.categoryBuffaloBg,
          text: colors.categoryBuffaloText,
          border: 'rgba(55, 71, 79, 0.4)',
        };
      case 'BOTH':
      default:
        return {
          label: 'COW & BUFFALO',
          icon: '🥛',
          bg: colors.categoryBothBg,
          text: colors.categoryBothText,
          border: 'rgba(106, 27, 154, 0.4)',
        };
    }
  };

  const cfg = getConfig();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
          paddingVertical: size === 'sm' ? 3 : size === 'lg' ? 8 : 5,
          paddingHorizontal: size === 'sm' ? 8 : size === 'lg' ? 16 : 12,
        },
        style,
      ]}
    >
      <Text style={[styles.icon, size === 'sm' && { fontSize: 11 }]}>{cfg.icon}</Text>
      <Text
        style={[
          styles.text,
          { color: cfg.text, fontSize: size === 'sm' ? 11 : size === 'lg' ? 14 : 12 },
        ]}
      >
        {cfg.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: clayBorderRadius.pill,
    borderWidth: 1.5,
    gap: 6,
    alignSelf: 'flex-start',
  },
  icon: {
    fontSize: 13,
  },
  text: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
