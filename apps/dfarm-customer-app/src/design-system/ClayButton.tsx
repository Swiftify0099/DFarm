import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
  View,
} from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_SHADOWS, DFARM_TYPOGRAPHY } from './theme';

export interface ClayButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const ClayButton: React.FC<ClayButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  style,
  textStyle,
  leftIcon,
  rightIcon,
}) => {
  const isInteractive = !disabled && !loading;

  const getContainerStyle = (): ViewStyle => {
    switch (variant) {
      case 'secondary':
        return styles.secondaryContainer;
      case 'outline':
        return styles.outlineContainer;
      case 'ghost':
        return styles.ghostContainer;
      case 'danger':
        return styles.dangerContainer;
      case 'primary':
      default:
        return styles.primaryContainer;
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'secondary':
        return styles.secondaryText;
      case 'outline':
        return styles.outlineText;
      case 'ghost':
        return styles.ghostText;
      case 'danger':
        return styles.dangerText;
      case 'primary':
      default:
        return styles.primaryText;
    }
  };

  const getSizeStyle = (): ViewStyle => {
    switch (size) {
      case 'sm':
        return styles.sizeSm;
      case 'md':
        return styles.sizeMd;
      case 'lg':
      default:
        return styles.sizeLg;
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={!isInteractive}
      style={({ pressed }) => [
        styles.base,
        getContainerStyle(),
        getSizeStyle(),
        disabled && styles.disabledContainer,
        pressed && isInteractive && styles.pressed,
        style,
      ]}
    >
      <View style={styles.topSpecular} />
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#FFFFFF' : DFARM_COLORS.primaryOrange}
        />
      ) : (
        <View style={styles.contentRow}>
          {leftIcon && <View style={styles.iconMargin}>{leftIcon}</View>}
          <Text
            style={[
              styles.baseText,
              getTextStyle(),
              disabled && styles.disabledText,
              textStyle,
            ]}
          >
            {title}
          </Text>
          {rightIcon && <View style={styles.iconMargin}>{rightIcon}</View>}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: DFARM_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  sizeSm: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    minHeight: 36,
  },
  sizeMd: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    minHeight: 46,
  },
  sizeLg: {
    paddingVertical: 15,
    paddingHorizontal: 28,
    minHeight: 54,
  },
  primaryContainer: {
    backgroundColor: DFARM_COLORS.primaryOrange,
    borderWidth: 1,
    borderColor: '#F05F00',
    ...DFARM_SHADOWS.clayButton,
  },
  secondaryContainer: {
    backgroundColor: DFARM_COLORS.surfaceWhite,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    ...DFARM_SHADOWS.claySecondaryButton,
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.primaryOrange,
  },
  ghostContainer: {
    backgroundColor: 'transparent',
  },
  dangerContainer: {
    backgroundColor: DFARM_COLORS.error,
    borderWidth: 1,
    borderColor: '#B71C1C',
    ...DFARM_SHADOWS.clayButton,
  },
  disabledContainer: {
    backgroundColor: '#EBE6E1',
    borderColor: '#DDD6D0',
    shadowOpacity: 0,
    elevation: 0,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMargin: {
    marginHorizontal: 6,
  },
  baseText: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  secondaryText: {
    color: DFARM_COLORS.primaryText,
    fontSize: 15,
  },
  outlineText: {
    color: DFARM_COLORS.primaryOrange,
    fontSize: 15,
  },
  ghostText: {
    color: DFARM_COLORS.primaryOrange,
    fontSize: 14,
  },
  dangerText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  disabledText: {
    color: '#9C958F',
  },
  topSpecular: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  pressed: {
    transform: [{ scale: 0.975 }],
    opacity: 0.92,
  },
});
