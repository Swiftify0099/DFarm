import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_TYPOGRAPHY } from './theme';

export interface ClayBadgeProps {
  label: string;
  variant?: 'cow' | 'buffalo' | 'success' | 'pending' | 'warning' | 'error' | 'orange' | 'neutral';
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
}

export const ClayBadge: React.FC<ClayBadgeProps> = ({
  label,
  variant = 'neutral',
  style,
  icon,
}) => {
  const getBadgeStyle = () => {
    switch (variant) {
      case 'cow':
        return {
          container: { backgroundColor: DFARM_COLORS.cowTagBg, borderColor: '#FFE0B2' },
          text: { color: DFARM_COLORS.cowTag },
        };
      case 'buffalo':
        return {
          container: { backgroundColor: DFARM_COLORS.buffaloTagBg, borderColor: '#B3E5FC' },
          text: { color: DFARM_COLORS.buffaloTag },
        };
      case 'success':
        return {
          container: { backgroundColor: DFARM_COLORS.successBg, borderColor: '#C8E6C9' },
          text: { color: DFARM_COLORS.success },
        };
      case 'pending':
      case 'warning':
        return {
          container: { backgroundColor: DFARM_COLORS.warningBg, borderColor: '#FFE0B2' },
          text: { color: DFARM_COLORS.warning },
        };
      case 'error':
        return {
          container: { backgroundColor: DFARM_COLORS.errorBg, borderColor: '#FFCDD2' },
          text: { color: DFARM_COLORS.error },
        };
      case 'orange':
        return {
          container: { backgroundColor: DFARM_COLORS.peach, borderColor: '#FAD1BA' },
          text: { color: DFARM_COLORS.primaryOrange },
        };
      case 'neutral':
      default:
        return {
          container: { backgroundColor: DFARM_COLORS.surfaceInset, borderColor: DFARM_COLORS.border },
          text: { color: DFARM_COLORS.secondaryText },
        };
    }
  };

  const badgeTheme = getBadgeStyle();

  return (
    <View style={[styles.badge, badgeTheme.container, style]}>
      <View style={styles.specular} />
      {icon && <View style={styles.iconMargin}>{icon}</View>}
      <Text style={[styles.text, badgeTheme.text]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: DFARM_RADIUS.pill,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  text: {
    ...DFARM_TYPOGRAPHY.badge,
    fontWeight: '700',
  },
  iconMargin: {
    marginRight: 4,
  },
  specular: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
});
