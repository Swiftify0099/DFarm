import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../theme/colors';

interface PrimaryButtonProps {
  text: string;
  onClick: () => void;
  enabled?: boolean;
  isLoading?: boolean;
  leadingIcon?: string;
  containerColor?: string;
  textColor?: string;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  text,
  onClick,
  enabled = true,
  isLoading = false,
  leadingIcon,
  containerColor = colors.primary,
  textColor = colors.onPrimary,
}) => {
  const isDisabled = !enabled || isLoading;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={isDisabled}
      style={[
        styles.button,
        { backgroundColor: containerColor },
        isDisabled && styles.buttonDisabled,
      ]}
      onPress={onClick}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View style={styles.contentRow}>
          {leadingIcon ? <Text style={[styles.icon, { color: textColor }]}>{leadingIcon}</Text> : null}
          <Text style={[styles.text, { color: textColor }]}>{text}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
