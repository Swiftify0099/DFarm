import React, { useRef } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { colors } from '../../theme/colors';
import { clayBorderRadius, clayShadows } from '../../theme/clay';

export interface ClayCardProps {
  children?: React.ReactNode;
  style?: ViewStyle | (ViewStyle | undefined)[] | undefined;
  contentStyle?: ViewStyle;
  onPress?: () => void;
  variant?: 'default' | 'elevated' | 'green' | 'amber' | 'inset' | 'subtle';
  backgroundColor?: string;
  borderColor?: string;
  activeOpacity?: number;
  disabled?: boolean;
}

export const ClayCard: React.FC<ClayCardProps> = ({
  children,
  style,
  contentStyle,
  onPress,
  variant = 'default',
  backgroundColor,
  borderColor,
  activeOpacity = 0.85,
  disabled = false,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!disabled && onPress) {
      Animated.spring(scaleAnim, {
        toValue: 0.98,
        useNativeDriver: true,
        speed: 30,
        bounciness: 0,
      }).start();
    }
  };

  const handlePressOut = () => {
    if (!disabled && onPress) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 25,
        bounciness: 4,
      }).start();
    }
  };

  const getVariantStyle = (): ViewStyle => {
    switch (variant) {
      case 'elevated':
        return styles.elevated;
      case 'green':
        return styles.green;
      case 'amber':
        return styles.amber;
      case 'inset':
        return styles.inset;
      case 'subtle':
        return styles.subtle;
      case 'default':
      default:
        return styles.defaultCard;
    }
  };

  const combinedStyles: (ViewStyle | undefined)[] = [
    styles.base,
    getVariantStyle(),
    backgroundColor ? { backgroundColor } : undefined,
    borderColor ? { borderColor } : undefined,
    Array.isArray(style) ? undefined : style,
  ];

  if (onPress && !disabled) {
    return (
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, Array.isArray(style) ? style : undefined]}>
        <TouchableOpacity
          style={combinedStyles}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={activeOpacity}
          disabled={disabled}
        >
          <View style={[styles.inner, contentStyle]}>{children}</View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <View style={[combinedStyles, Array.isArray(style) ? style : undefined]}>
      <View style={[styles.inner, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: clayBorderRadius.card,
    overflow: 'hidden',
  },
  inner: {
    width: '100%',
  },
  defaultCard: {
    backgroundColor: colors.claySurfaceCard,
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
  elevated: {
    backgroundColor: colors.claySurfaceElevated,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 3,
    borderRightWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.18)',
    borderLeftColor: 'rgba(255, 255, 255, 0.10)',
    borderBottomColor: 'rgba(0, 0, 0, 0.50)',
    borderRightColor: 'rgba(0, 0, 0, 0.35)',
    ...clayShadows.raisedLg,
  },
  green: {
    backgroundColor: colors.primaryGreen,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 3,
    borderRightWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.35)',
    borderLeftColor: 'rgba(255, 255, 255, 0.18)',
    borderBottomColor: '#0E3711',
    borderRightColor: '#0E3711',
    ...clayShadows.raisedMd,
  },
  amber: {
    backgroundColor: '#8C4C00',
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 3,
    borderRightWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.35)',
    borderLeftColor: 'rgba(255, 255, 255, 0.18)',
    borderBottomColor: '#4A2800',
    borderRightColor: '#4A2800',
    ...clayShadows.raisedMd,
  },
  inset: {
    backgroundColor: colors.clayInsetBg,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopColor: colors.clayInsetBorderTop,
    borderLeftColor: colors.clayInsetBorderTop,
    borderBottomColor: colors.clayInsetBorderBottom,
    borderRightColor: colors.clayInsetBorderBottom,
  },
  subtle: {
    backgroundColor: 'rgba(25, 32, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
});
