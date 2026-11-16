import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  ClayCard,
  ClayBadge,
  ClayHeader,
  ClayModal,
  ClayButton,
  ClayEmptyState,
} from '../../design-system';
import { useBills } from '../../features/bills/useBills';
import { BillStatement } from '../../types/bills';

export default function BillsScreen() {
  const { bills, isLoadingBills } = useBills();
  const [selectedBill, setSelectedBill] = useState<BillStatement | null>(null);

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Bills & Statements"
        subtitle="10-Day Billing Cycles & Bank Disbursals"
      />

      {bills.length === 0 ? (
        <ClayEmptyState
          title="No Bills Generated"
          description="Bills are generated at the end of every 10-day cycle by your dairy."
        />
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(item) => item.billId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable onPress={() => setSelectedBill(item)}>
              <ClayCard variant="raised" style={styles.billCard}>
                <View style={styles.billHeader}>
                  <View>
                    <Text style={styles.cycleLabel}>{item.cycleLabel}</Text>
                    <Text style={styles.billNo}>Bill No: {item.billNumber}</Text>
                  </View>
                  <ClayBadge
                    label={item.status}
                    variant={item.status === 'DISBURSED' ? 'success' : 'pending'}
                  />
                </View>

                <View style={styles.billGrid}>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Total Liters</Text>
                    <Text style={styles.gridVal}>{item.totalLiters} L</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Gross Value</Text>
                    <Text style={styles.gridVal}>
                      ₹{item.grossMilkAmount.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Deductions</Text>
                    <Text style={styles.gridValDeduct}>
                      -₹{item.feedDeductions + item.otherDeductions}
                    </Text>
                  </View>
                </View>

                <View style={styles.billFooter}>
                  <View>
                    <Text style={styles.netLabel}>Net Payout</Text>
                    <Text style={styles.netAmount}>
                      ₹{item.netPayableAmount.toFixed(2)}
                    </Text>
                  </View>
                  {item.disbursedDate && (
                    <Text style={styles.disbursedText}>
                      Paid on {item.disbursedDate}
                    </Text>
                  )}
                </View>
              </ClayCard>
            </Pressable>
          )}
        />
      )}

      {/* Detailed Bill Breakdown Modal */}
      {selectedBill && (
        <ClayModal
          visible={!!selectedBill}
          onClose={() => setSelectedBill(null)}
          title="Billing Statement"
          subtitle={selectedBill.cycleLabel}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalStatusRow}>
              <ClayBadge
                label={selectedBill.status}
                variant={
                  selectedBill.status === 'DISBURSED' ? 'success' : 'pending'
                }
              />
              <Text style={styles.billIdText}>{selectedBill.billNumber}</Text>
            </View>

            <View style={styles.breakdownTable}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Cycle Duration</Text>
                <Text style={styles.rowVal}>
                  {selectedBill.cycleStartDate} to {selectedBill.cycleEndDate}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Total Milk Supplied</Text>
                <Text style={styles.rowValBold}>
                  {selectedBill.totalLiters} Liters
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Gross Milk Value</Text>
                <Text style={styles.rowVal}>
                  ₹{selectedBill.grossMilkAmount.toFixed(2)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Cattle Feed Deductions</Text>
                <Text style={styles.deductVal}>
                  -₹{selectedBill.feedDeductions.toFixed(2)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Miscellaneous Charges</Text>
                <Text style={styles.deductVal}>
                  -₹{selectedBill.otherDeductions.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.row, styles.netRow]}>
                <Text style={styles.netRowLabel}>Net Paid to Bank</Text>
                <Text style={styles.netRowVal}>
                  ₹{selectedBill.netPayableAmount.toFixed(2)}
                </Text>
              </View>
            </View>

            {selectedBill.utrNumber && (
              <View style={styles.utrBox}>
                <Text style={styles.utrLabel}>Bank UTR Reference:</Text>
                <Text style={styles.utrValue}>{selectedBill.utrNumber}</Text>
                <Text style={styles.utrMode}>Mode: {selectedBill.paymentMode}</Text>
              </View>
            )}

            <ClayButton
              title="Download Statement (PDF)"
              onPress={() => setSelectedBill(null)}
              variant="outline"
              style={styles.downloadBtn}
            />
          </View>
        </ClayModal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 84,
  },
  billCard: {
    marginBottom: 14,
    padding: 16,
  },
  billHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cycleLabel: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
    marginBottom: 2,
  },
  billNo: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  billGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
  },
  gridItem: {
    flex: 1,
  },
  gridLabel: {
    fontSize: 10,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  gridVal: {
    fontSize: 13,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  gridValDeduct: {
    fontSize: 13,
    fontWeight: '700',
    color: DFARM_COLORS.error,
  },
  billFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 6,
  },
  netLabel: {
    fontSize: 11,
    color: DFARM_COLORS.secondaryText,
  },
  netAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: DFARM_COLORS.primaryOrange,
  },
  disbursedText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.success,
    fontWeight: '600',
  },
  modalContent: {
    paddingVertical: 6,
  },
  modalStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  billIdText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  breakdownTable: {
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  rowVal: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '600',
    color: DFARM_COLORS.primaryText,
  },
  rowValBold: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
  },
  deductVal: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.error,
  },
  netRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: DFARM_COLORS.border,
  },
  netRowLabel: {
    ...DFARM_TYPOGRAPHY.bodyLg,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  netRowVal: {
    ...DFARM_TYPOGRAPHY.h2,
    color: DFARM_COLORS.primaryOrange,
  },
  utrBox: {
    backgroundColor: DFARM_COLORS.peach,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  utrLabel: {
    fontSize: 11,
    color: DFARM_COLORS.secondaryText,
  },
  utrValue: {
    fontSize: 13,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
    marginTop: 2,
  },
  utrMode: {
    fontSize: 11,
    color: DFARM_COLORS.secondaryText,
    marginTop: 2,
  },
  downloadBtn: {
    marginTop: 4,
  },
});
