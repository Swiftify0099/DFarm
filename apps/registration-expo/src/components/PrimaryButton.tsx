import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { clayColors, clayRadius, clayStyles } from '../theme/claymorphism';

export type ButtonVariant = 'primary' | 'secondary' | 'outlined' | 'destructive';

export interface PrimaryButtonProps {
  text: string;
  onClick: () => void;
  enabled?: boolean;
  isLoading?: boolean;
  leadingIcon?: string | React.ReactNode;
  containerColor?: string;
  textColor?: string;
  variant?: ButtonVariant;
  style?: ViewStyle;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  text,
  onClick,
  enabled = true,
  isLoading = false,
  leadingIcon,
  containerColor,
  textColor,
  variant = 'primary',
  style,
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const isDisabled = !enabled || isLoading;

  // Determine styling based on variant
  let baseButtonStyle: ViewStyle = clayStyles.buttonPrimary;
  let defaultTextColor: string = clayColors.onPrimary;

  if (variant === 'secondary') {
    baseButtonStyle = clayStyles.buttonSecondary;
    defaultTextColor = clayColors.primary;
  } else if (variant === 'outlined') {
    baseButtonStyle = clayStyles.buttonOutlined;
    defaultTextColor = clayColors.primary;
  } else if (variant === 'destructive') {
    baseButtonStyle = clayStyles.buttonDestructive;
    defaultTextColor = clayColors.onError;
  }

  // Override colors if explicitly passed
  const customBackground = containerColor ? { backgroundColor: containerColor } : {};
  const finalTextColor = textColor || defaultTextColor;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      disabled={isDisabled}
      onPress={onClick}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      style={[
        styles.baseButton,
        baseButtonStyle,
        customBackground,
        isPressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={finalTextColor} />
      ) : (
        <View style={styles.contentRow}>
          {leadingIcon ? (
            typeof leadingIcon === 'string' ? (
              <Text style={[styles.iconText, { color: finalTextColor }]}>{leadingIcon}</Text>
            ) : (
              <View style={styles.iconNode}>{leadingIcon}</View>
            )
          ) : null}
          <Text style={[styles.text, { color: finalTextColor }]}>{text}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseButton: {
    height: 52,
    borderRadius: clayRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 18,
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }, { translateY: 2 }],
    borderBottomWidth: 1.5,
  },
  buttonDisabled: {
    opacity: 0.55,
    borderBottomWidth: 1,
    elevation: 0,
    shadowOpacity: 0,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
    marginRight: 8,
  },
  iconNode: {
    marginRight: 8,
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
