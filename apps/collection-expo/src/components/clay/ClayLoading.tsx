import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { clayBorderRadius } from '../../theme/clay';

export interface ClayLoadingProps {
  message?: string;
  size?: 'small' | 'large';
  style?: ViewStyle;
}

export const ClayLoading: React.FC<ClayLoadingProps> = ({
  message = 'Loading...',
  size = 'large',
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.card}>
        <ActivityIndicator size={size} color={colors.clayGreenLight} />
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.claySurfaceCard,
    paddingHorizontal: 28,
    paddingVertical: 20,
    borderRadius: clayBorderRadius.card,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 2.5,
    borderRightWidth: 1.5,
    borderTopColor: colors.claySurfaceHighlight,
    borderLeftColor: colors.claySurfaceHighlightSoft,
    borderBottomColor: colors.claySurfaceShadow,
    borderRightColor: colors.claySurfaceShadowSubtle,
    alignItems: 'center',
    gap: 12,
  },
  message: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
