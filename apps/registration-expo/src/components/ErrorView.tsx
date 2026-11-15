import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';
import { clayAssets } from '../theme/assets';

interface ErrorViewProps {
  message: string;
  onRetry: () => void;
}

export const ErrorView: React.FC<ErrorViewProps> = ({ message, onRetry }) => {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Image
          source={clayAssets.networkError}
          style={styles.illustration}
          resizeMode="contain"
        />

        <Text style={styles.title}>Unable to Complete Request</Text>
        <Text style={styles.message}>{message}</Text>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.retryButton}
          onPress={onRetry}
        >
          <Text style={styles.retryIcon}>🔄</Text>
          <Text style={styles.retryText}>Retry Action</Text>
        </TouchableOpacity>
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
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 24,
    alignItems: 'center',
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255,255,255,0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  illustration: {
    width: 140,
    height: 140,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: clayColors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: clayColors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  retryButton: {
    backgroundColor: clayColors.primary,
    borderRadius: clayRadius.md,
    paddingHorizontal: 24,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: 'rgba(255, 255, 255, 0.45)',
    borderLeftColor: 'rgba(255, 255, 255, 0.25)',
    borderRightColor: 'rgba(0, 30, 45, 0.25)',
    borderBottomColor: 'rgba(0, 20, 35, 0.45)',
    ...Platform.select({
      ios: {
        shadowColor: clayColors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  retryIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
