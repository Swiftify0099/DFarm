import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Animated,
  View,
} from 'react-native';
import { colors } from '../../theme/colors';
import { clayBorderRadius, clayShadows } from '../../theme/clay';

export interface ClayButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'amber' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export const ClayButton: React.FC<ClayButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!disabled && !isLoading) {
      Animated.spring(scaleAnim, {
        toValue: 0.97,
        useNativeDriver: true,
        speed: 35,
        bounciness: 0,
      }).start();
    }
  };

  const handlePressOut = () => {
    if (!disabled && !isLoading) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 30,
        bounciness: 4,
      }).start();
    }
  };

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle } => {
    if (disabled) {
      return {
        container: {
          backgroundColor: '#202632',
          borderTopColor: 'rgba(255, 255, 255, 0.05)',
          borderBottomColor: '#12161E',
          borderTopWidth: 1,
          borderBottomWidth: 1.5,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: '#202632',
        },
        text: {
          color: colors.textSecondary,
          opacity: 0.6,
        },
      };
    }

    switch (variant) {
      case 'primary':
        return {
          container: {
            backgroundColor: colors.clayGreen,
            borderTopWidth: 1.5,
            borderLeftWidth: 1.5,
            borderBottomWidth: 3,
            borderRightWidth: 1.5,
            borderTopColor: 'rgba(255, 255, 255, 0.35)',
            borderLeftColor: 'rgba(255, 255, 255, 0.18)',
            borderBottomColor: '#14461B',
            borderRightColor: '#14461B',
            ...clayShadows.raisedSm,
          },
          text: {
            color: colors.textPrimary,
          },
        };

      case 'secondary':
        return {
          container: {
            backgroundColor: colors.claySurfaceElevated,
            borderTopWidth: 1.5,
            borderLeftWidth: 1.5,
            borderBottomWidth: 3,
            borderRightWidth: 1.5,
            borderTopColor: colors.claySurfaceHighlight,
            borderLeftColor: colors.claySurfaceHighlightSoft,
            borderBottomColor: '#10141A',
            borderRightColor: '#10141A',
            ...clayShadows.raisedSm,
          },
          text: {
            color: colors.textPrimary,
          },
        };

      case 'outline':
        return {
          container: {
            backgroundColor: 'rgba(25, 32, 42, 0.7)',
            borderWidth: 1.5,
            borderColor: colors.clayGreenLight,
            borderTopColor: 'rgba(129, 199, 132, 0.6)',
            borderBottomColor: 'rgba(27, 94, 32, 0.8)',
          },
          text: {
            color: colors.textPrimary,
          },
        };

      case 'danger':
        return {
          container: {
            backgroundColor: colors.clayRed,
            borderTopWidth: 1.5,
            borderLeftWidth: 1.5,
            borderBottomWidth: 3,
            borderRightWidth: 1.5,
            borderTopColor: 'rgba(255, 255, 255, 0.3)',
            borderLeftColor: 'rgba(255, 255, 255, 0.15)',
            borderBottomColor: '#7F1D1D',
            borderRightColor: '#7F1D1D',
            ...clayShadows.raisedSm,
          },
          text: {
            color: colors.textPrimary,
          },
        };

      case 'amber':
        return {
          container: {
            backgroundColor: colors.clayAmber,
            borderTopWidth: 1.5,
            borderLeftWidth: 1.5,
            borderBottomWidth: 3,
            borderRightWidth: 1.5,
            borderTopColor: 'rgba(255, 255, 255, 0.38)',
            borderLeftColor: 'rgba(255, 255, 255, 0.2)',
            borderBottomColor: '#8C4C00',
            borderRightColor: '#8C4C00',
            ...clayShadows.raisedSm,
          },
          text: {
            color: '#121212',
          },
        };

      case 'subtle':
      default:
        return {
          container: {
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.12)',
          },
          text: {
            color: colors.textSecondary,
          },
        };
    }
  };

  const getSizeStyles = (): { height: number; paddingHorizontal: number; fontSize: number } => {
    switch (size) {
      case 'sm':
        return { height: 38, paddingHorizontal: 12, fontSize: 13 };
      case 'lg':
        return { height: 54, paddingHorizontal: 24, fontSize: 16 };
      case 'md':
      default:
        return { height: 48, paddingHorizontal: 18, fontSize: 15 };
    }
  };

  const variantStyle = getVariantStyles();
  const sizeStyle = getSizeStyles();

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <TouchableOpacity
        style={[
          styles.base,
          {
            height: sizeStyle.height,
            paddingHorizontal: sizeStyle.paddingHorizontal,
          },
          variantStyle.container,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || isLoading}
        activeOpacity={0.88}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.textPrimary} size="small" />
        ) : (
          <View style={styles.contentRow}>
            {icon && <View style={styles.iconContainer}>{icon}</View>}
            <Text
              style={[
                styles.text,
                { fontSize: sizeStyle.fontSize },
                variantStyle.text,
                textStyle,
              ]}
            >
              {title}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: clayBorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 8,
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
