import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { colors } from '../../components/theme/colors';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { StatTile } from '../../components/common/StatTile';
import { OfflineBanner } from '../../components/common/OfflineBanner';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { dashboardApi, CustomerDashboardData } from '../../api/dashboard.api';
import { formatCurrency, getBalanceStatusLabel } from '../../utils/currency';
import { formatWeightKg } from '../../utils/units';
import { formatDateShort, formatDateTime } from '../../utils/date';

export interface DashboardScreenProps {
  navigation: any;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation }) => {
  const { currentCustomer, session } = useAuth();
  const { isOnline } = useNetwork();

  const [dashboard, setDashboard] = useState<CustomerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const customerId = currentCustomer?.id || session?.customer_id;

  const loadData = useCallback(async () => {
    if (!customerId) return;
    setErrorMsg(null);
    try {
      const response = await dashboardApi.getDashboard(customerId);
      setDashboard(response.data);
      setIsFromCache(response.fromCache);
      setLastSyncedAt(response.syncedAt);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to retrieve dashboard metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading && !dashboard) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoadingSpinner message="Loading farmer dashboard..." fullScreen />
      </SafeAreaView>
    );
  }

  const { customer, financials, todayStats, currentMonthStats, recentCollection, pendingBill, recentPayment } =
    dashboard || ({} as Partial<CustomerDashboardData>);

  const balanceStatus = financials ? getBalanceStatusLabel(financials.currentBalance) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner
        isOnline={isOnline}
        isCachedData={isFromCache}
        lastSyncedAt={lastSyncedAt || undefined}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* Customer Header Card */}
        <Card variant="elevated" style={styles.profileHeaderCard}>
          <View style={styles.profileTopRow}>
            <View style={styles.profileInfo}>
              <Text style={styles.customerName}>{customer?.fullName || currentCustomer?.fullName || 'Farmer Partner'}</Text>
              <View style={styles.codeRow}>
                <Badge label={`Code: ${customer?.farmerCode || currentCustomer?.farmerCode || '---'}`} variant="info" size="sm" />
                <Text style={styles.customerIdText}>ID: {customerId ? customerId.substring(0, 8) : '---'}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('Profile')}
              style={styles.avatarPill}
            >
              <Text style={styles.avatarInitials}>
                {(customer?.fullName || currentCustomer?.fullName || 'DF').substring(0, 2).toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Authoritative Current Balance Box */}
          <View style={styles.balanceBox}>
            <View>
              <Text style={styles.balanceLabel}>Authoritative Ledger Balance</Text>
              <Text style={styles.balanceAmount}>
                {financials ? formatCurrency(financials.currentBalance) : '₹0.00'}
              </Text>
            </View>
            {balanceStatus && (
              <Badge
                label={balanceStatus.label}
                variant={balanceStatus.type as any}
                size="md"
              />
            )}
          </View>
          <Text style={styles.serverAuthorityFootnote}>
            ✓ Server-authoritative balance calculated via double-entry journal.
          </Text>
        </Card>

        {/* Quick Nav Action Shortcuts */}
        <View style={styles.shortcutsGrid}>
          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => navigation.navigate('MilkHistory')}
          >
            <Text style={styles.shortcutIcon}>🥛</Text>
            <Text style={styles.shortcutLabel}>Milk History</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => navigation.navigate('CustomerLedger')}
          >
            <Text style={styles.shortcutIcon}>📖</Text>
            <Text style={styles.shortcutLabel}>Passbook</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => navigation.navigate('MonthlyBills')}
          >
            <Text style={styles.shortcutIcon}>📑</Text>
            <Text style={styles.shortcutLabel}>Statements</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => navigation.navigate('FeedHistory')}
          >
            <Text style={styles.shortcutIcon}>🌾</Text>
            <Text style={styles.shortcutLabel}>Cattle Feed</Text>
          </TouchableOpacity>
        </View>

        {/* Today's Milk Delivery Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Milk Delivery</Text>
          <Text style={styles.sectionSubtitle}>
            {todayStats?.businessDate ? formatDateShort(todayStats.businessDate) : 'Today'}
          </Text>
        </View>

        <View style={styles.tileGrid}>
          <StatTile
            title="Cow Milk"
            value={formatWeightKg(todayStats?.todayCowMilkKg || 0)}
            subtitle={formatCurrency(todayStats?.todayCowAmount || 0)}
            color="#2563EB"
            style={styles.halfTile}
          />
          <StatTile
            title="Buffalo Milk"
            value={formatWeightKg(todayStats?.todayBuffaloMilkKg || 0)}
            subtitle={formatCurrency(todayStats?.todayBuffaloAmount || 0)}
            color="#7C3AED"
            style={styles.halfTile}
          />
        </View>

        {/* Current Month Aggregates */}
        <Card variant="flat" style={styles.monthCard}>
          <View style={styles.monthHeaderRow}>
            <Text style={styles.monthCardTitle}>Current Month Summary</Text>
            <Badge label={`${currentMonthStats?.collectionsCount || 0} Deliveries`} variant="neutral" size="sm" />
          </View>
          <View style={styles.monthMetricsRow}>
            <View>
              <Text style={styles.metricLabel}>Total Milk Delivered</Text>
              <Text style={styles.metricBigWeight}>
                {formatWeightKg(currentMonthStats?.totalMilkWeightKg || 0)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.metricLabel}>Gross Value</Text>
              <Text style={styles.metricBigAmount}>
                {formatCurrency(currentMonthStats?.totalMilkAmount || 0)}
              </Text>
            </View>
          </View>
        </Card>

        {/* Recent Milk Collection Slip Preview */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Latest Milk Receipt</Text>
          {recentCollection && (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('CollectionDetail', {
                  sessionId: recentCollection.sessionId,
                  receiptNumber: recentCollection.receiptNumber,
                })
              }
            >
              <Text style={styles.viewMoreLink}>View Thermal Slip →</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentCollection ? (
          <Card
            variant="outlined"
            style={styles.recentSlipCard}
            onPress={() =>
              navigation.navigate('CollectionDetail', {
                sessionId: recentCollection.sessionId,
                receiptNumber: recentCollection.receiptNumber,
              })
            }
          >
            <View style={styles.slipTopRow}>
              <View>
                <Text style={styles.slipDate}>
                  {formatDateShort(recentCollection.businessDate)} • {recentCollection.shiftType}
                </Text>
                <Text style={styles.slipReceiptNo}>Receipt #{recentCollection.receiptNumber}</Text>
              </View>
              <Badge
                label={recentCollection.milkCategory}
                variant={recentCollection.milkCategory === 'COW' ? 'info' : 'warning'}
                size="sm"
              />
            </View>

            <View style={styles.slipDetailsGrid}>
              <View style={styles.slipItem}>
                <Text style={styles.slipLabel}>Net Weight</Text>
                <Text style={styles.slipValBold}>{formatWeightKg(recentCollection.netWeight)}</Text>
              </View>
              <View style={styles.slipItem}>
                <Text style={styles.slipLabel}>Fat / SNF</Text>
                <Text style={styles.slipVal}>
                  {recentCollection.fatPercentage.toFixed(1)}% / {recentCollection.snfPercentage.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.slipItem}>
                <Text style={styles.slipLabel}>Applied Rate</Text>
                <Text style={styles.slipVal}>₹{recentCollection.appliedRatePerUnit.toFixed(2)}/KG</Text>
              </View>
              <View style={styles.slipItem}>
                <Text style={styles.slipLabel}>Total Amount</Text>
                <Text style={styles.slipValGreen}>{formatCurrency(recentCollection.totalAmount)}</Text>
              </View>
            </View>
          </Card>
        ) : (
          <Card variant="flat" style={styles.emptyCard}>
            <Text style={styles.emptyText}>No recent milk deliveries recorded today.</Text>
          </Card>
        )}

        {/* Pending Statement & Recent Settlement Row */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Financial Updates</Text>
        </View>

        <View style={styles.financialRow}>
          {/* Pending Bill */}
          <Card
            variant="flat"
            style={styles.halfFinCard}
            onPress={() => pendingBill && navigation.navigate('MonthlyBills')}
          >
            <Text style={styles.finCardHeader}>Pending Statement</Text>
            {pendingBill ? (
              <View style={styles.finContent}>
                <Text style={styles.finPeriodName}>{pendingBill.periodName || 'Current Cycle'}</Text>
                <Text style={styles.finPayableAmount}>
                  {formatCurrency(pendingBill.netPayableAmount)}
                </Text>
                <Badge
                  label={pendingBill.billStatus}
                  variant={pendingBill.billStatus === 'SETTLED' ? 'success' : 'warning'}
                  size="sm"
                />
              </View>
            ) : (
              <Text style={styles.finEmpty}>No unpaid statements pending.</Text>
            )}
          </Card>

          {/* Recent Payment */}
          <Card
            variant="flat"
            style={styles.halfFinCard}
            onPress={() => recentPayment && navigation.navigate('Payments')}
          >
            <Text style={styles.finCardHeader}>Recent Payment</Text>
            {recentPayment ? (
              <View style={styles.finContent}>
                <Text style={styles.finPeriodName}>
                  {recentPayment.paymentMethod} • {recentPayment.direction === 'DAIRY_PAYS_CUSTOMER' ? 'Payout' : 'Collection'}
                </Text>
                <Text style={styles.finPayableAmount}>{formatCurrency(recentPayment.amount)}</Text>
                <Badge
                  label={recentPayment.status}
                  variant={recentPayment.status === 'SETTLED' ? 'success' : 'info'}
                  size="sm"
                />
              </View>
            ) : (
              <Text style={styles.finEmpty}>No recent payouts on record.</Text>
            )}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  profileHeaderCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  profileTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  customerIdText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  avatarPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 16,
  },
  balanceBox: {
    marginTop: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  serverAuthorityFootnote: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  shortcutsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  shortcutBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 12,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  shortcutIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  shortcutLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  viewMoreLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  tileGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  halfTile: {
    flex: 1,
  },
  monthCard: {
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    marginBottom: 20,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  monthCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  monthMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#475569',
  },
  metricBigWeight: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E3A8A',
    marginTop: 2,
  },
  metricBigAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#047857',
    marginTop: 2,
  },
  recentSlipCard: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  slipTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: 8,
  },
  slipDate: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  slipReceiptNo: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  slipDetailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  slipItem: {
    alignItems: 'center',
  },
  slipLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  slipVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  slipValBold: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  slipValGreen: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
  },
  emptyCard: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  financialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfFinCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  finCardHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  finContent: {
    gap: 4,
  },
  finPeriodName: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  finPayableAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  finEmpty: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
