import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { formatDateTime } from '../../utils/date';

export interface OfflineBannerProps {
  isOffline?: boolean;
  isOnline?: boolean;
  isCachedData?: boolean;
  lastSyncedAt?: string | null;
  syncedAt?: string | null;
  isSyncing?: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  isOffline,
  isOnline,
  isCachedData,
  lastSyncedAt,
  syncedAt,
  isSyncing,
}) => {
  const effectiveOffline = isOffline !== undefined ? isOffline : (isOnline !== undefined ? !isOnline : false);
  const effectiveSyncedAt = lastSyncedAt || syncedAt;

  if (!effectiveOffline && !isSyncing && !isCachedData) return null;

  return (
    <View style={[styles.container, effectiveOffline ? styles.offlineContainer : styles.syncingContainer]}>
      <View style={styles.indicatorRow}>
        <View style={[styles.dot, effectiveOffline ? styles.offlineDot : styles.syncingDot]} />
        <Text style={[styles.title, effectiveOffline ? styles.offlineText : styles.syncingText]}>
          {effectiveOffline ? 'Offline Mode (Read-Only)' : isCachedData ? 'Cached Data' : 'Synchronizing Records...'}
        </Text>
      </View>
      <Text style={styles.subtitle}>
        {effectiveOffline || isCachedData
          ? `Displaying cached records. Last synchronized: ${formatDateTime(effectiveSyncedAt)}`
          : 'Connecting to dairy servers to refresh authoritative ledger and receipts...'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 6,
    borderWidth: 1,
  },
  offlineContainer: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  syncingContainer: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  offlineDot: {
    backgroundColor: '#D97706',
  },
  syncingDot: {
    backgroundColor: '#0284C7',
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
  },
  offlineText: {
    color: '#92400E',
  },
  syncingText: {
    color: '#0369A1',
  },
  subtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
});
