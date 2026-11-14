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
import {
  ledgerApi,
  CustomerLedgerSummaryData,
  LedgerTransactionItem,
} from '../../api/ledger.api';
import { formatCurrency, getBalanceStatusLabel } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';

export const CustomerLedgerScreen: React.FC = () => {
  const { currentCustomer, session } = useAuth();
  const { isOnline } = useNetwork();
  const customerId = currentCustomer?.id || session?.customer_id;

  const [summary, setSummary] = useState<CustomerLedgerSummaryData | null>(null);
  const [transactions, setTransactions] = useState<LedgerTransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const fetchLedger = useCallback(async () => {
    if (!customerId) return;
    try {
      const [sumRes, txRes] = await Promise.all([
        ledgerApi.getSummary(customerId),
        ledgerApi.getTransactions(customerId, 50, 0),
      ]);

      setSummary(sumRes.data);
      setTransactions(txRes.data.transactions || []);
      setIsFromCache(sumRes.fromCache || txRes.fromCache);
      setLastSyncedAt(sumRes.syncedAt);
    } catch (err) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId]);

  useEffect(() => {
    setLoading(true);
    fetchLedger();
  }, [fetchLedger]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLedger();
  };

  const balanceStatus = summary ? getBalanceStatusLabel(summary.currentBalance) : null;

  const renderHeader = () => {
    if (!summary) return null;

    return (
      <View style={styles.headerContainer}>
        {/* Authoritative Balance Banner */}
        <Card variant="elevated" style={styles.balanceCard}>
          <Text style={styles.balanceHeaderLabel}>Current Closing Balance</Text>
          <Text style={styles.balanceMainValue}>
            {formatCurrency(summary.currentBalance)}
          </Text>

          {balanceStatus && (
            <View style={styles.badgeWrapper}>
              <Badge
                label={balanceStatus.label}
                variant={balanceStatus.type as any}
                size="md"
              />
            </View>
          )}

          <View style={styles.authoritativeNote}>
            <Text style={styles.authoritativeText}>
              ✓ Authoritative Balance derived from double-entry journal entries.
            </Text>
          </View>
        </Card>

        {/* Ledger Breakdown Card */}
        <Card variant="flat" style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Account Ledger Summary</Text>

          <View style={styles.breakdownRow}>
            <Text style={styles.rowLabel}>Opening Balance</Text>
            <Text style={styles.rowValue}>{formatCurrency(summary.openingBalance)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.breakdownRow}>
            <Text style={[styles.rowLabel, { color: colors.success }]}>+ Milk Delivered (Credits)</Text>
            <Text style={[styles.rowValue, { color: colors.success }]}>
              {formatCurrency(summary.totalMilkCredits)}
            </Text>
          </View>

          {summary.otherApprovedCredits > 0 && (
            <View style={styles.breakdownRow}>
              <Text style={[styles.rowLabel, { color: colors.success }]}>+ Other Credits</Text>
              <Text style={[styles.rowValue, { color: colors.success }]}>
                {formatCurrency(summary.otherApprovedCredits)}
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.breakdownRow}>
            <Text style={[styles.rowLabel, { color: colors.error }]}>- Feed Purchases (Debits)</Text>
            <Text style={[styles.rowValue, { color: colors.error }]}>
              {formatCurrency(summary.otherDebits)}
            </Text>
          </View>

          <View style={styles.breakdownRow}>
            <Text style={[styles.rowLabel, { color: colors.error }]}>- Cash Advances</Text>
            <Text style={[styles.rowValue, { color: colors.error }]}>
              {formatCurrency(summary.advances)}
            </Text>
          </View>

          <View style={styles.breakdownRow}>
            <Text style={[styles.rowLabel, { color: colors.error }]}>- Deductions / Fees</Text>
            <Text style={[styles.rowValue, { color: colors.error }]}>
              {formatCurrency(summary.deductions)}
            </Text>
          </View>

          <View style={styles.breakdownRow}>
            <Text style={[styles.rowLabel, { color: colors.error }]}>- Settled Dairy Payouts</Text>
            <Text style={[styles.rowValue, { color: colors.error }]}>
              {formatCurrency(summary.settledPayouts)}
            </Text>
          </View>

          <View style={styles.dividerBold} />

          <View style={styles.breakdownRow}>
            <Text style={styles.closingLabel}>Authoritative Balance</Text>
            <Text style={styles.closingValue}>{formatCurrency(summary.currentBalance)}</Text>
          </View>
        </Card>

        <View style={styles.txHeaderRow}>
          <Text style={styles.txTitle}>Passbook Transactions</Text>
          <Text style={styles.txSubtitle}>Recent Journal Entries</Text>
        </View>
      </View>
    );
  };

  const renderTransaction = ({ item }: { item: LedgerTransactionItem }) => {
    const isCredit = item.direction === 'CREDIT';

    return (
      <Card variant="flat" style={styles.txCard}>
        <View style={styles.txTopRow}>
          <View style={styles.txLeft}>
            <Text style={styles.txType}>{item.transactionType.replace(/_/g, ' ')}</Text>
            <Text style={styles.txDate}>{formatDateTime(item.createdAt)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.txAmount, isCredit ? styles.amountCredit : styles.amountDebit]}>
              {isCredit ? '+' : '-'} {formatCurrency(item.amount)}
            </Text>
            <Text style={styles.txBalanceAfter}>Bal: {formatCurrency(item.balanceAfter)}</Text>
          </View>
        </View>
        {item.description && (
          <Text style={styles.txDescription}>{item.description}</Text>
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
        <LoadingSpinner message="Calculating authoritative ledger..." fullScreen />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={item => item.id}
          renderItem={renderTransaction}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="📖"
              title="No Ledger Transactions"
              message="No financial journal entries have been recorded yet."
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
  headerContainer: {
    marginBottom: 16,
  },
  balanceCard: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: colors.card,
  },
  balanceHeaderLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  balanceMainValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    marginVertical: 6,
  },
  badgeWrapper: {
    marginBottom: 12,
  },
  authoritativeNote: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  authoritativeText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  breakdownCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.card,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  breakdownTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 4,
  },
  dividerBold: {
    height: 2,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  closingLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closingValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
  },
  txHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 8,
  },
  txTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  txSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  txCard: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  txTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txLeft: {
    flex: 1,
  },
  txType: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  txDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  amountCredit: {
    color: colors.success,
  },
  amountDebit: {
    color: colors.error,
  },
  txBalanceAfter: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  txDescription: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 4,
  },
});
