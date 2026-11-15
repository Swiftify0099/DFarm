import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';

export type DeviceType = 'SCALE' | 'ANALYZER' | 'PRINTER' | 'RFID';

export type DeviceState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AWAITING_STABLE'
  | 'STABLE'
  | 'OVERLOAD'
  | 'ANALYZING'
  | 'RESULTS_RECEIVED'
  | 'PRINTING'
  | 'ERROR'
  | 'MANUAL_ENTRY'
  | 'DEFERRED_HARDWARE_BOUNDARY';

export interface ClayDeviceBadgeProps {
  deviceType: DeviceType;
  state: DeviceState;
  customLabel?: string;
  style?: ViewStyle;
}

export const ClayDeviceBadge: React.FC<ClayDeviceBadgeProps> = ({
  deviceType,
  state,
  customLabel,
  style,
}) => {
  const getDeviceIcon = (): string => {
    switch (deviceType) {
      case 'SCALE':
        return '⚖️';
      case 'ANALYZER':
        return '🧪';
      case 'PRINTER':
        return '🖨️';
      case 'RFID':
        return '💳';
      default:
        return '📟';
    }
  };

  const getStateConfig = (): { label: string; dotColor: string; bg: string; border: string } => {
    switch (state) {
      case 'CONNECTED':
      case 'STABLE':
      case 'RESULTS_RECEIVED':
        return {
          label: customLabel || 'CONNECTED',
          dotColor: colors.statusValid,
          bg: 'rgba(76, 175, 80, 0.16)',
          border: 'rgba(76, 175, 80, 0.4)',
        };

      case 'CONNECTING':
      case 'AWAITING_STABLE':
      case 'ANALYZING':
      case 'PRINTING':
        return {
          label: customLabel || 'BUSY',
          dotColor: colors.accentAmber,
          bg: 'rgba(255, 143, 0, 0.16)',
          border: 'rgba(255, 143, 0, 0.4)',
        };

      case 'MANUAL_ENTRY':
      case 'DEFERRED_HARDWARE_BOUNDARY':
        return {
          label: customLabel || 'MANUAL INPUT',
          dotColor: colors.clayBlueLight,
          bg: 'rgba(2, 136, 209, 0.16)',
          border: 'rgba(2, 136, 209, 0.4)',
        };

      case 'OVERLOAD':
      case 'ERROR':
        return {
          label: customLabel || 'DEVICE ERROR',
          dotColor: colors.statusError,
          bg: 'rgba(229, 57, 53, 0.16)',
          border: 'rgba(229, 57, 53, 0.4)',
        };

      case 'DISCONNECTED':
      default:
        return {
          label: customLabel || 'DISCONNECTED',
          dotColor: colors.textSecondary,
          bg: 'rgba(255, 255, 255, 0.08)',
          border: 'rgba(255, 255, 255, 0.14)',
        };
    }
  };

  const config = getStateConfig();

  return (
    <View style={[styles.container, { backgroundColor: config.bg, borderColor: config.border }, style]}>
      <Text style={styles.icon}>{getDeviceIcon()}</Text>
      <View style={[styles.dot, { backgroundColor: config.dotColor }]} />
      <Text style={[styles.label, { color: config.dotColor }]}>{config.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  icon: {
    fontSize: 13,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
