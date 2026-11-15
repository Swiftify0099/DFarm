import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';

interface LoadingIndicatorProps {
  message?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message = 'Loading...',
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.clayCard}>
        <View style={styles.spinnerPill}>
          <ActivityIndicator size="large" color={clayColors.primary} />
        </View>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  clayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    paddingVertical: 28,
    paddingHorizontal: 32,
    alignItems: 'center',
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255,255,255,0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
      default: {},
    }),
  },
  spinnerPill: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F3FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#C4DBE8',
    borderBottomColor: '#C4DBE8',
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
    color: clayColors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
