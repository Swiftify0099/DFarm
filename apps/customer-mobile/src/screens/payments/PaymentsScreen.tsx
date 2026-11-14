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
import { StatTile } from '../../components/common/StatTile';
import { OfflineBanner } from '../../components/common/OfflineBanner';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import {
  paymentsApi,
  CustomerPayoutItem,
  CustomerPaymentSummaryData,
} from '../../api/payments.api';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort, formatDateTime } from '../../utils/date';

export interface PaymentsScreenProps {
  navigation: any;
}

export const PaymentsScreen: React.FC<PaymentsScreenProps> = ({ navigation }) => {
  const { currentCustomer, session } = useAuth();
  const { isOnline } = useNetwork();
  const customerId = currentCustomer?.id || session?.customer_id;

  const [payouts, setPayouts] = useState<CustomerPayoutItem[]>([]);
  const [summary, setSummary] = useState<CustomerPaymentSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    if (!customerId) return;
    try {
      const [payoutsRes, summaryRes] = await Promise.all([
        paymentsApi.getPayoutHistory(customerId, 50, 0),
        paymentsApi.getPaymentSummary(customerId).catch(() => ({
          data: null,
          fromCache: false,
          syncedAt: new Date().toISOString(),
        })),
      ]);

      setPayouts(payoutsRes.data.payouts || []);
      setSummary(summaryRes.data);
      setIsFromCache(payoutsRes.fromCache);
      setLastSyncedAt(payoutsRes.syncedAt);
    } catch (err) {
      console.error('Failed to load payouts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId]);

  useEffect(() => {
    setLoading(true);
    fetchPayments();
  }, [fetchPayments]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPayments();
  };

  const getStatusVariant = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'SETTLED':
        return 'success';
      case 'INITIATED':
      case 'PROCESSING':
        return 'warning';
      case 'FAILED':
      case 'REVERSED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const renderHeader = () => {
    if (!summary) return null;

    return (
      <View style={styles.headerBox}>
        <View style={styles.tileRow}>
          <StatTile
            title="Settled Payouts"
            value={formatCurrency(summary.totalSettledPayouts || 0)}
            subtitle={`${summary.payoutCount || 0} Transfers`}
            color="#059669"
            style={styles.halfTile}
          />
          <StatTile
            title="Pending Payouts"
            value={formatCurrency(summary.totalPendingPayouts || 0)}
            subtitle="Processing"
            color="#D97706"
            style={styles.halfTile}
          />
        </View>

        {summary.totalFailedPayouts > 0 && (
          <View style={styles.reversalAlert}>
            <Text style={styles.reversalTitle}>⚠️ Reversal / Failed Payouts Detected</Text>
            <Text style={styles.reversalDesc}>
              {formatCurrency(summary.totalFailedPayouts)} in payments encountered bank rejection and were credited back to your dairy ledger.
            </Text>
          </View>
        )}

        <Text style={styles.listHeaderTitle}>Disbursement History</Text>
      </View>
    );
  };

  const renderPayout = ({ item }: { item: CustomerPayoutItem }) => {
    const isSettled = item.status === 'SETTLED';
    const isFailed = item.status === 'FAILED' || item.status === 'REVERSED';

    return (
      <Card
        variant="elevated"
        style={styles.payoutCard}
        onPress={() =>
          navigation.navigate('PaymentDetail', {
            payoutId: item.id,
            payoutItem: item,
          })
        }
      >
        <View style={styles.cardTopRow}>
          <View>
            <Text style={styles.paymentMethodText}>
              {item.payment_method} Transfer
            </Text>
            <Text style={styles.dateText}>
              {item.settled_at ? formatDateTime(item.settled_at) : formatDateTime(item.created_at)}
            </Text>
          </View>
          <Badge
            label={item.status}
            variant={getStatusVariant(item.status)}
            size="sm"
          />
        </View>

        <View style={styles.cardMidRow}>
          <View>
            <Text style={styles.label}>Bank Account</Text>
            <Text style={styles.val}>{item.bank_account_mask || 'Registered Bank Account'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.label}>Amount</Text>
            <Text style={[styles.amountVal, isSettled ? styles.amountGreen : styles.amountRegular]}>
              {formatCurrency(item.amount)}
            </Text>
          </View>
        </View>

        {item.reference_number && (
          <View style={styles.utrBox}>
            <Text style={styles.utrLabel}>Bank Reference (UTR):</Text>
            <Text style={styles.utrValue}>{item.reference_number}</Text>
          </View>
        )}

        {isFailed && item.failure_reason && (
          <View style={styles.failBox}>
            <Text style={styles.failText}>Reason: {item.failure_reason}</Text>
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
        <LoadingSpinner message="Loading disbursement records..." fullScreen />
      ) : (
        <FlatList
          data={payouts}
          keyExtractor={item => item.id}
          renderItem={renderPayout}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="💳"
              title="No Payment Disbursements"
              message="No milk payout transfers or banking receipts are on record for this account."
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
    paddingBottom: 32,
  },
  headerBox: {
    marginBottom: 16,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  halfTile: {
    flex: 1,
  },
  reversalAlert: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  reversalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 2,
  },
  reversalDesc: {
    fontSize: 11,
    color: '#B91C1C',
    lineHeight: 16,
  },
  listHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 4,
  },
  payoutCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: colors.card,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  paymentMethodText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dateText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardMidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  amountVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  amountGreen: {
    color: colors.success,
  },
  amountRegular: {
    color: colors.textPrimary,
  },
  utrBox: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  utrLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  utrValue: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  failBox: {
    marginTop: 8,
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 6,
  },
  failText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '500',
  },
});
