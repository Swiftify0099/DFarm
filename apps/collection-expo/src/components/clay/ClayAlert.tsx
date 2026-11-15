import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';
import { clayBorderRadius } from '../../theme/clay';

export interface ClayAlertProps {
  type?: 'error' | 'warning' | 'info' | 'success';
  message: string;
  title?: string;
  onDismiss?: () => void;
  style?: ViewStyle;
}

export const ClayAlert: React.FC<ClayAlertProps> = ({
  type = 'error',
  message,
  title,
  onDismiss,
  style,
}) => {
  const getConfig = () => {
    switch (type) {
      case 'warning':
        return {
          bg: 'rgba(255, 143, 0, 0.16)',
          border: colors.accentAmber,
          text: colors.accentAmber,
          icon: '⚠️',
          defaultTitle: 'Notice',
        };
      case 'info':
        return {
          bg: 'rgba(2, 136, 209, 0.16)',
          border: colors.clayBlueLight,
          text: colors.clayBlueLight,
          icon: 'ℹ️',
          defaultTitle: 'Information',
        };
      case 'success':
        return {
          bg: 'rgba(76, 175, 80, 0.16)',
          border: colors.statusValid,
          text: colors.statusValid,
          icon: '✓',
          defaultTitle: 'Success',
        };
      case 'error':
      default:
        return {
          bg: 'rgba(229, 57, 53, 0.16)',
          border: colors.statusError,
          text: colors.statusError,
          icon: '⛔',
          defaultTitle: 'Error',
        };
    }
  };

  const cfg = getConfig();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
        },
        style,
      ]}
    >
      <Text style={styles.icon}>{cfg.icon}</Text>
      <View style={styles.textContainer}>
        {title && <Text style={[styles.title, { color: cfg.text }]}>{title}</Text>}
        <Text style={[styles.message, { color: colors.textPrimary }]}>{message}</Text>
      </View>
      {onDismiss && (
        <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
          <Text style={styles.dismissText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    padding: 14,
    borderRadius: clayBorderRadius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  dismissBtn: {
    padding: 6,
  },
  dismissText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
