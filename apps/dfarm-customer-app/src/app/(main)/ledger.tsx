import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  ClayCard,
  ClayBadge,
  ClayHeader,
  ClayEmptyState,
} from '../../design-system';
import { useLedger } from '../../features/ledger/useLedger';

export default function LedgerScreen() {
  const { entries, summary, isLoadingEntries } = useLedger();

  const currentBalance = summary?.currentBalance ?? 0;
  const totalCredits = summary?.totalMilkEarnings ?? 0;
  const totalDebits = summary?.totalDeductions ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Customer Khata"
        subtitle="अधिकृत दुग्ध खाते व ताळेबंद"
      />

      {/* Top Ledger Summary Card */}
      <View style={styles.summarySection}>
        <ClayCard variant="highlight" style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <Text style={styles.summaryTitle}>Current Account Balance</Text>
            <ClayBadge
              label={currentBalance >= 0 ? 'Payable to You' : 'Due to Dairy'}
              variant={currentBalance >= 0 ? 'success' : 'error'}
            />
          </View>

          <Text style={styles.balanceBig}>
            ₹{currentBalance.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>

          <View style={styles.summaryBreakdown}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Total Milk Credits</Text>
              <Text style={styles.creditValue}>
                +₹{totalCredits.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Feed / Deductions</Text>
              <Text style={styles.debitValue}>
                -₹{totalDebits.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
          </View>
        </ClayCard>

        {/* Audit Guarantee Note */}
        <View style={styles.auditNotice}>
          <View style={styles.auditDot} />
          <Text style={styles.auditNoticeText}>
            Official Dairy Khata: Double-entry audit trail certified by dairy administration.
          </Text>
        </View>
      </View>

      {/* Ledger Transaction Stream */}
      {entries.length === 0 ? (
        <ClayEmptyState
          title="No Ledger Entries"
          description="Your Khata ledger does not have any recorded transactions yet."
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isCredit = item.type === 'MILK_CREDIT';
            const categoryLabel =
              item.type === 'MILK_CREDIT'
                ? 'Milk Intake Credit'
                : item.type === 'FEED_DEBIT'
                ? 'Cattle Feed Debit'
                : item.type === 'BANK_PAYOUT'
                ? 'Bank Disbursal'
                : 'Adjustment';

            return (
              <ClayCard variant="raised" style={styles.entryCard}>
                <View style={styles.entryHeader}>
                  <View style={styles.entryLeft}>
                    <ClayBadge
                      label={categoryLabel}
                      variant={isCredit ? 'cow' : 'neutral'}
                    />
                    <Text style={styles.entryDesc}>{item.description}</Text>
                  </View>

                  <View style={styles.entryAmountCol}>
                    <Text
                      style={[
                        styles.entryAmount,
                        isCredit ? styles.creditAmount : styles.debitAmount,
                      ]}
                    >
                      {isCredit
                        ? `+₹${((item.creditAmount ?? 0)).toFixed(2)}`
                        : `-₹${((item.debitAmount ?? 0)).toFixed(2)}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.entryFooter}>
                  <Text style={styles.footerRef}>Ref: #{item.referenceId || item.id}</Text>
                  <Text style={styles.runningBalance}>
                    Balance: ₹{((item.runningBalance ?? 0)).toFixed(2)}
                  </Text>
                </View>
              </ClayCard>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  summarySection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  summaryCard: {
    padding: 18,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryTitle: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
  },
  balanceBig: {
    ...DFARM_TYPOGRAPHY.numberDisplay,
    fontSize: 32,
    color: DFARM_COLORS.primaryOrange,
    marginVertical: 6,
  },
  summaryBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F7D6C1',
  },
  breakdownItem: {
    flex: 1,
  },
  breakdownLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  creditValue: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: '#2E7D32',
    marginTop: 2,
  },
  debitValue: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: '#D32F2F',
    marginTop: 2,
  },
  verticalDivider: {
    width: 1.5,
    height: 32,
    backgroundColor: '#F7D6C1',
    marginHorizontal: 14,
  },
  auditNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9F5',
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
    borderRadius: DFARM_RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    gap: 8,
  },
  auditDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2E7D32',
  },
  auditNoticeText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    flex: 1,
    lineHeight: 16,
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  entryCard: {
    padding: 14,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  entryLeft: {
    flex: 1,
    marginRight: 10,
    gap: 4,
  },
  entryDesc: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '600',
    color: DFARM_COLORS.primaryText,
    marginTop: 2,
  },
  entryAmountCol: {
    alignItems: 'flex-end',
  },
  entryAmount: {
    ...DFARM_TYPOGRAPHY.h3,
    fontWeight: '800',
  },
  creditAmount: {
    color: '#2E7D32',
  },
  debitAmount: {
    color: '#D32F2F',
  },
  entryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: DFARM_COLORS.border,
    paddingTop: 8,
  },
  footerRef: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  runningBalance: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
});
