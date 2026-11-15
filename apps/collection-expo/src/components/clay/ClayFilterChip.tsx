import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  Animated,
  View,
} from 'react-native';
import { colors } from '../../theme/colors';
import { clayBorderRadius, clayShadows } from '../../theme/clay';

export interface ClayFilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  badge?: string;
  style?: ViewStyle;
}

export const ClayFilterChip: React.FC<ClayFilterChipProps> = ({
  label,
  selected,
  onPress,
  icon,
  badge,
  style,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 35,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <TouchableOpacity
        style={[
          styles.chip,
          selected ? styles.selectedChip : styles.unselectedChip,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.88}
      >
        <View style={styles.innerRow}>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <Text
            style={[
              styles.text,
              selected ? styles.selectedText : styles.unselectedText,
            ]}
          >
            {label}
          </Text>
          {badge && (
            <View
              style={[
                styles.badge,
                selected ? styles.selectedBadge : styles.unselectedBadge,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  selected ? styles.selectedBadgeText : styles.unselectedBadgeText,
                ]}
              >
                {badge}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: clayBorderRadius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconContainer: {
    marginRight: 2,
  },
  selectedChip: {
    backgroundColor: colors.clayGreen,
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
  unselectedChip: {
    backgroundColor: colors.claySurfaceElevated,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderBottomWidth: 1.5,
    borderRightWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderLeftColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomColor: '#10141A',
    borderRightColor: '#10141A',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  selectedText: {
    color: colors.textPrimary,
  },
  unselectedText: {
    color: colors.textSecondary,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  selectedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  unselectedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  selectedBadgeText: {
    color: colors.textPrimary,
  },
  unselectedBadgeText: {
    color: colors.textSecondary,
  },
});
