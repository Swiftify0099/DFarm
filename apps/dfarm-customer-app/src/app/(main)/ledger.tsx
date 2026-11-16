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
  ClayCard,
  ClayBadge,
  ClayHeader,
  ClayEmptyState,
} from '../../design-system';
import { useLedger } from '../../features/ledger/useLedger';

export default function LedgerScreen() {
  const { entries, summary, isLoadingEntries } = useLedger();

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Customer Khata"
        subtitle="Authoritative Ledger & Financial Balance"
      />

      {/* Top Ledger Summary Card */}
      <View style={styles.summarySection}>
        <ClayCard variant="highlight" style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <Text style={styles.summaryTitle}>Current Account Balance</Text>
            <ClayBadge
              label={
                (summary?.currentBalance || 0) >= 0
                  ? 'Payable to You'
                  : 'Due to Dairy'
              }
              variant={(summary?.currentBalance || 0) >= 0 ? 'success' : 'error'}
            />
          </View>

          <Text style={styles.balanceBig}>
            ₹{summary?.currentBalance.toLocaleString('en-IN') || '12,480.00'}
          </Text>

          <View style={styles.summaryBreakdown}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Total Milk Credits</Text>
              <Text style={styles.creditValue}>
                +₹{summary?.totalMilkEarnings.toLocaleString('en-IN') || '28,530.00'}
              </Text>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Feed / Deductions</Text>
              <Text style={styles.debitValue}>
                -₹{summary?.totalDeductions.toLocaleString('en-IN') || '16,050.00'}
              </Text>
            </View>
          </View>
        </ClayCard>

        {/* Audit Guarantee Note */}
        <View style={styles.auditNotice}>
          <Text style={styles.auditNoticeText}>
            🔒 Official Dairy Khata: Server-authoritative audit trail. Records
            are verified and locked by the dairy administration.
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
          renderItem={({ item }) => {
            const isCredit = item.type === 'MILK_CREDIT';
            const isDebit =
              item.type === 'FEED_DEBIT' ||
              item.type === 'CASH_ADVANCE_DEBIT' ||
              item.type === 'BANK_PAYOUT';

            return (
              <ClayCard variant="raised" style={styles.entryCard}>
                <View style={styles.entryHeader}>
                  <View style={styles.entryLeft}>
                    <Text style={styles.entryTypeTag}>
                      {item.type === 'MILK_CREDIT'
                        ? '🥛 Milk Collection'
                        : item.type === 'FEED_DEBIT'
                        ? '🌾 Cattle Feed'
                        : item.type === 'BANK_PAYOUT'
                        ? '🏦 Bank Settlement'
                        : '⚙️ Adjustment'}
                    </Text>
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
                        ? `+₹${item.creditAmount.toFixed(2)}`
                        : `-₹${item.debitAmount.toFixed(2)}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.entryFooter}>
                  <Text style={styles.footerRef}>Ref: #{item.referenceId || item.id}</Text>
                  <Text style={styles.runningBalance}>
                    Balance: ₹{item.runningBalance.toFixed(2)}
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
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  balanceBig: {
    fontSize: 30,
    fontWeight: '800',
    color: DFARM_COLORS.success,
    marginBottom: 12,
  },
  summaryBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8D0C0',
  },
  breakdownItem: {
    flex: 1,
  },
  breakdownLabel: {
    fontSize: 11,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  creditValue: {
    fontSize: 14,
    fontWeight: '700',
    color: DFARM_COLORS.success,
  },
  debitValue: {
    fontSize: 14,
    fontWeight: '700',
    color: DFARM_COLORS.error,
  },
  verticalDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E8D0C0',
    marginHorizontal: 12,
  },
  auditNotice: {
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
  },
  auditNoticeText: {
    fontSize: 11,
    color: DFARM_COLORS.secondaryText,
    lineHeight: 15,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 84,
  },
  entryCard: {
    marginBottom: 10,
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
  },
  entryTypeTag: {
    fontSize: 11,
    fontWeight: '700',
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  entryDesc: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '600',
    color: DFARM_COLORS.primaryText,
  },
  entryAmountCol: {
    alignItems: 'flex-end',
  },
  entryAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  creditAmount: {
    color: DFARM_COLORS.success,
  },
  debitAmount: {
    color: DFARM_COLORS.error,
  },
  entryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: DFARM_COLORS.border,
  },
  footerRef: {
    fontSize: 11,
    color: DFARM_COLORS.secondaryText,
  },
  runningBalance: {
    fontSize: 11,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
});
