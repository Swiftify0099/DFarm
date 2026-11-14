import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
} from 'react-native';
import { colors } from '../../components/theme/colors';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { OfflineBanner } from '../../components/common/OfflineBanner';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { feedApi, FeedSaleData } from '../../api/feed.api';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort } from '../../utils/date';

export interface FeedHistoryScreenProps {
  navigation: any;
}

export const FeedHistoryScreen: React.FC<FeedHistoryScreenProps> = ({ navigation }) => {
  const { currentCustomer, session } = useAuth();
  const { isOnline } = useNetwork();
  const customerId = currentCustomer?.id || session?.customer_id;

  const [sales, setSales] = useState<FeedSaleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    if (!customerId) return;
    try {
      const response = await feedApi.getCustomerFeedPurchases(customerId);
      setSales(response.data || []);
      setIsFromCache(response.fromCache);
      setLastSyncedAt(response.syncedAt);
    } catch (err) {
      console.error('Failed to load feed purchases:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId]);

  useEffect(() => {
    setLoading(true);
    fetchSales();
  }, [fetchSales]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSales();
  };

  const renderItem = ({ item }: { item: FeedSaleData }) => {
    const isCredit = item.paymentMode === 'CREDIT';

    return (
      <Card
        variant="elevated"
        style={styles.feedCard}
        onPress={() =>
          navigation.navigate('FeedSaleDetail', {
            saleId: item.id,
            invoiceNumber: item.invoiceNumber,
          })
        }
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.invoiceNumber}>Invoice #{item.invoiceNumber}</Text>
            <Text style={styles.saleDate}>{formatDateShort(item.saleDate)}</Text>
          </View>
          <Badge
            label={item.paymentMode}
            variant={isCredit ? 'warning' : 'success'}
            size="sm"
          />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoCol}>
            <Text style={styles.label}>Receipt No</Text>
            <Text style={styles.val}>{item.receiptNumber || '---'}</Text>
          </View>
          <View style={[styles.infoCol, { alignItems: 'flex-end' }]}>
            <Text style={styles.label}>Total Invoiced</Text>
            <Text style={styles.totalAmount}>{formatCurrency(item.totalAmount)}</Text>
          </View>
        </View>

        {isCredit && (
          <View style={styles.creditNote}>
            <Text style={styles.creditNoteText}>
              Debited to your customer ledger and deducted during monthly bill settlement.
            </Text>
          </View>
        )}
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner
        isOnline={isOnline}
        isCachedData={isFromCache}
        lastSyncedAt={lastSyncedAt || undefined}
      />

      {loading && !refreshing ? (
        <LoadingSpinner message="Loading cattle feed purchase history..." fullScreen />
      ) : (
        <FlatList
          data={sales}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="🌾"
              title="No Feed Purchases"
              message="You have not purchased cattle feed or supplements from your dairy center."
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
  listContent: {
    padding: 16,
    gap: 12,
  },
  feedCard: {
    padding: 16,
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  saleDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoCol: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  val: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  creditNote: {
    marginTop: 10,
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 6,
  },
  creditNoteText: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 15,
  },
});
