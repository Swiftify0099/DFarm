import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { colors } from '../../components/theme/colors';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { OfflineBanner } from '../../components/common/OfflineBanner';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import {
  notificationsApi,
  CustomerNotificationItem,
} from '../../api/notifications.api';
import { formatDateTime } from '../../utils/date';

export const NotificationsScreen: React.FC = () => {
  const { currentCustomer, session } = useAuth();
  const { isOnline } = useNetwork();
  const customerId = currentCustomer?.id || session?.customer_id;

  const [notifications, setNotifications] = useState<CustomerNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!customerId) return;
    try {
      const response = await notificationsApi.getNotifications(customerId);
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
      setIsFromCache(response.fromCache);
      setLastSyncedAt(response.syncedAt);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId]);

  useEffect(() => {
    setLoading(true);
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAsRead = async (notificationId: string) => {
    if (!customerId) return;
    // Optimistic UI update
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      await notificationsApi.markAsRead(customerId, notificationId);
    } catch (err) {
      // Revert if error
      fetchNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    if (!customerId) return;
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await notificationsApi.markAllAsRead(customerId);
    } catch (err) {
      fetchNotifications();
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'MILK_COLLECTION':
        return '🥛';
      case 'BILL_GENERATED':
        return '📑';
      case 'PAYOUT_SETTLED':
        return '💰';
      case 'PAYMENT_FAILED':
        return '⚠️';
      default:
        return '🔔';
    }
  };

  const renderItem = ({ item }: { item: CustomerNotificationItem }) => {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => !item.isRead && handleMarkAsRead(item.id)}
      >
        <Card
          variant={item.isRead ? 'flat' : 'elevated'}
          style={item.isRead ? styles.notifCard : [styles.notifCard, styles.unreadCard]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconEmoji}>{getNotificationIcon(item.type)}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={[styles.titleText, !item.isRead && styles.unreadTitle]}>
                {item.title}
              </Text>
              <Text style={styles.timeText}>{formatDateTime(item.createdAt)}</Text>
            </View>
            {!item.isRead && (
              <View style={styles.unreadDot} />
            )}
          </View>

          <Text style={styles.messageText}>{item.message}</Text>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner
        isOnline={isOnline}
        isCachedData={isFromCache}
        lastSyncedAt={lastSyncedAt || undefined}
      />

      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.screenTitle}>Notification Inbox</Text>
          {unreadCount > 0 && (
            <Badge label={`${unreadCount} New`} variant="danger" size="sm" />
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <LoadingSpinner message="Checking notifications..." fullScreen />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="🔔"
              title="Inbox is Empty"
              message="You have no notifications or alerts at this time."
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  screenTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  notifCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  unreadCard: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  iconEmoji: {
    fontSize: 18,
  },
  headerInfo: {
    flex: 1,
  },
  titleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  unreadTitle: {
    fontWeight: '700',
    color: '#0369A1',
  },
  timeText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: 8,
  },
  messageText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
