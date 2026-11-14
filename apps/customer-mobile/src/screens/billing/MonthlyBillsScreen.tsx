import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
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
import { dashboardApi } from '../../api/dashboard.api';
import { billingApi, CustomerStatementSummaryData } from '../../api/billing.api';
import { formatCurrency } from '../../utils/currency';
import { formatWeightKg } from '../../utils/units';
import { formatDateShort } from '../../utils/date';

export interface MonthlyBillsScreenProps {
  navigation: any;
}

export const MonthlyBillsScreen: React.FC<MonthlyBillsScreenProps> = ({ navigation }) => {
  const { currentCustomer, session } = useAuth();
  const { isOnline } = useNetwork();
  const customerId = currentCustomer?.id || session?.customer_id;

  const [statement, setStatement] = useState<CustomerStatementSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [billId, setBillId] = useState<string | null>(null);

  const fetchBillStatement = useCallback(async () => {
    if (!customerId) return;
    try {
      // 1. Get dashboard to find active/recent bill ID
      const dashRes = await dashboardApi.getDashboard(customerId);
      const pending = dashRes.data.pendingBill;

      if (pending && pending.id) {
        setBillId(pending.id);
        const billRes = await billingApi.getCustomerStatement(pending.id);
        setStatement(billRes.data);
        setIsFromCache(billRes.fromCache);
        setLastSyncedAt(billRes.syncedAt);
      } else {
        setStatement(null);
      }
    } catch (err) {
      console.error('Failed to load bill statement:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId]);

  useEffect(() => {
    setLoading(true);
    fetchBillStatement();
  }, [fetchBillStatement]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBillStatement();
  };

  const handleOpenPdf = (targetBillId: string, billNumber: string) => {
    navigation.navigate('PdfViewer', {
      billId: targetBillId,
      billNumber: billNumber,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner
        isOnline={isOnline}
        isCachedData={isFromCache}
        lastSyncedAt={lastSyncedAt || undefined}
      />

      {loading && !refreshing ? (
        <LoadingSpinner message="Loading monthly statement..." fullScreen />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {statement ? (
            <View>
              {/* Top Summary Card */}
              <Card variant="elevated" style={styles.statementCard}>
                <View style={styles.statementHeader}>
                  <View>
                    <Text style={styles.dairyOrgName}>{statement.dairy.organizationName}</Text>
                    <Text style={styles.dairyCenterName}>{statement.dairy.centerName}</Text>
                    <Text style={styles.billNumberText}>Statement #{statement.bill.billNumber}</Text>
                  </View>
                  <Badge
                    label={statement.bill.billStatus}
                    variant={statement.bill.billStatus === 'SETTLED' ? 'success' : 'warning'}
                    size="md"
                  />
                </View>

                {/* Period Info */}
                <View style={styles.periodBanner}>
                  <Text style={styles.periodLabel}>Billing Cycle:</Text>
                  <Text style={styles.periodDates}>
                    {statement.period.periodName} ({formatDateShort(statement.period.startDate)} - {formatDateShort(statement.period.endDate)})
                  </Text>
                </View>

                {/* Net Payable Highlight */}
                <View style={styles.netPayableBox}>
                  <View>
                    <Text style={styles.netPayableLabel}>
                      {statement.bill.isNegativeBalance ? 'Customer Debt Carried Forward' : 'Net Amount Payable'}
                    </Text>
                    <Text
                      style={[
                        styles.netPayableAmount,
                        statement.bill.isNegativeBalance && { color: colors.error },
                      ]}
                    >
                      {formatCurrency(statement.bill.netPayableAmount)}
                    </Text>
                  </View>
                  {statement.bill.isNegativeBalance && (
                    <Badge label="Negative Carryover" variant="danger" size="sm" />
                  )}
                </View>

                {/* PDF Statement Action */}
                <Button
                  title="📄 View & Download PDF Statement"
                  variant="primary"
                  onPress={() => handleOpenPdf(statement.bill.id, statement.bill.billNumber)}
                  style={styles.pdfBtn}
                />
              </Card>

              {/* Milk Delivery Breakdown by Category */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Milk Delivery Breakdown</Text>
              </View>

              <View style={styles.categoryGrid}>
                {/* Cow Milk Card */}
                <Card variant="flat" style={styles.categoryCard}>
                  <View style={styles.categoryHeader}>
                    <Text style={styles.categoryTitle}>🐄 Cow Milk</Text>
                    <Badge
                      label={`${statement.milkBreakdown.cow.collectionsCount} Deliveries`}
                      variant="info"
                      size="sm"
                    />
                  </View>
                  <View style={styles.catMetricRow}>
                    <Text style={styles.catMetricLabel}>Total Weight (KG):</Text>
                    <Text style={styles.catMetricVal}>
                      {formatWeightKg(statement.milkBreakdown.cow.totalQuantityKg)}
                    </Text>
                  </View>
                  <View style={styles.catMetricRow}>
                    <Text style={styles.catMetricLabel}>Gross Amount:</Text>
                    <Text style={styles.catMetricAmount}>
                      {formatCurrency(statement.milkBreakdown.cow.totalAmount)}
                    </Text>
                  </View>
                </Card>

                {/* Buffalo Milk Card */}
                <Card variant="flat" style={styles.categoryCard}>
                  <View style={styles.categoryHeader}>
                    <Text style={styles.categoryTitle}>🐃 Buffalo Milk</Text>
                    <Badge
                      label={`${statement.milkBreakdown.buffalo.collectionsCount} Deliveries`}
                      variant="success"
                      size="sm"
                    />
                  </View>
                  <View style={styles.catMetricRow}>
                    <Text style={styles.catMetricLabel}>Total Weight (KG):</Text>
                    <Text style={styles.catMetricVal}>
                      {formatWeightKg(statement.milkBreakdown.buffalo.totalQuantityKg)}
                    </Text>
                  </View>
                  <View style={styles.catMetricRow}>
                    <Text style={styles.catMetricLabel}>Gross Amount:</Text>
                    <Text style={styles.catMetricAmount}>
                      {formatCurrency(statement.milkBreakdown.buffalo.totalAmount)}
                    </Text>
                  </View>
                </Card>
              </View>

              {/* Financial Calculation Statement Table */}
              <Card variant="flat" style={styles.financialSummaryCard}>
                <Text style={styles.finTableTitle}>Statement Financials</Text>

                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>Previous Balance</Text>
                  <Text style={styles.tableVal}>{formatCurrency(statement.bill.openingBalance)}</Text>
                </View>

                <View style={styles.tableRow}>
                  <Text style={[styles.tableLabel, { color: colors.success }]}>
                    + Gross Milk Value ({formatWeightKg(statement.bill.totalMilkWeight)})
                  </Text>
                  <Text style={[styles.tableVal, { color: colors.success }]}>
                    {formatCurrency(statement.bill.grossMilkAmount)}
                  </Text>
                </View>

                {statement.bill.otherCreditsAmount > 0 && (
                  <View style={styles.tableRow}>
                    <Text style={[styles.tableLabel, { color: colors.success }]}>+ Other Credits</Text>
                    <Text style={[styles.tableVal, { color: colors.success }]}>
                      {formatCurrency(statement.bill.otherCreditsAmount)}
                    </Text>
                  </View>
                )}

                <View style={styles.tableDivider} />

                <View style={styles.tableRow}>
                  <Text style={[styles.tableLabel, { color: colors.error }]}>- Feed Purchases Debit</Text>
                  <Text style={[styles.tableVal, { color: colors.error }]}>
                    {formatCurrency(statement.bill.feedPurchasesDebit)}
                  </Text>
                </View>

                <View style={styles.tableRow}>
                  <Text style={[styles.tableLabel, { color: colors.error }]}>- Cash Advances Debit</Text>
                  <Text style={[styles.tableVal, { color: colors.error }]}>
                    {formatCurrency(statement.bill.advancesDebit)}
                  </Text>
                </View>

                <View style={styles.tableRow}>
                  <Text style={[styles.tableLabel, { color: colors.error }]}>- Deductions / Surcharges</Text>
                  <Text style={[styles.tableVal, { color: colors.error }]}>
                    {formatCurrency(statement.bill.deductionsDebit)}
                  </Text>
                </View>

                <View style={styles.tableDividerBold} />

                <View style={styles.tableRow}>
                  <Text style={styles.tableFinalLabel}>Net Payable / Closing</Text>
                  <Text style={styles.tableFinalVal}>
                    {formatCurrency(statement.bill.netPayableAmount)}
                  </Text>
                </View>
              </Card>
            </View>
          ) : (
            <EmptyState
              icon="📑"
              title="No Statement Available"
              message="No monthly billing statements are currently published for your account."
              actionLabel="Refresh Statements"
              onAction={onRefresh}
            />
          )}
        </ScrollView>
      )}
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
  statementCard: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.card,
    marginBottom: 20,
  },
  statementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dairyOrgName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dairyCenterName: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  billNumberText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  periodBanner: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  periodLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  periodDates: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 2,
  },
  netPayableBox: {
    backgroundColor: '#EFF6FF',
    padding: 14,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  netPayableLabel: {
    fontSize: 12,
    color: '#1E3A8A',
    fontWeight: '600',
  },
  netPayableAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E3A8A',
    marginTop: 2,
  },
  pdfBtn: {
    width: '100%',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  categoryGrid: {
    gap: 12,
    marginBottom: 20,
  },
  categoryCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  catMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  catMetricLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  catMetricVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  catMetricAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
  },
  financialSummaryCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  finTableTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  tableLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  tableVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tableDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 4,
  },
  tableDividerBold: {
    height: 2,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  tableFinalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tableFinalVal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
});
