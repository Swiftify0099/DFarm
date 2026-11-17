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
  DFARM_RADIUS,
  ClayCard,
  ClayBadge,
  ClayHeader,
  ClayModal,
  ClayButton,
  ClayEmptyState,
} from '../../design-system';
import { useBills } from '../../features/bills/useBills';
import { BillStatement } from '../../types/bills';
import { NavBillsIcon } from '../../assets/vectors/NavAssets';

export default function BillsScreen() {
  const { bills, isLoadingBills } = useBills();
  const [selectedBill, setSelectedBill] = useState<BillStatement | null>(null);

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Bills & Statements"
        subtitle="१०-दिवसीय देयक चक्र व बँक जमा"
      />

      {bills.length === 0 ? (
        <ClayEmptyState
          title="No Bills Generated"
          description="Billing statements are generated at the end of every 10-day cycle by your dairy administration."
        />
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(item) => item.billId}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedBill(item)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <ClayCard variant="raised" style={styles.billCard}>
                <View style={styles.billHeader}>
                  <View style={styles.billHeaderLeft}>
                    <NavBillsIcon size={20} color={DFARM_COLORS.primaryOrange} />
                    <View>
                      <Text style={styles.cycleLabel}>{item.cycleLabel}</Text>
                      <Text style={styles.billNo}>Bill #{item.billNumber}</Text>
                    </View>
                  </View>
                  <ClayBadge
                    label={item.status}
                    variant={item.status === 'DISBURSED' ? 'success' : 'pending'}
                  />
                </View>

                <View style={styles.billGrid}>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Total Milk</Text>
                    <Text style={styles.gridVal}>{item.totalLiters} L</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Gross Earnings</Text>
                    <Text style={styles.gridVal}>
                      ₹{item.grossMilkAmount.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Deductions</Text>
                    <Text style={styles.gridValDeduct}>
                      -₹{(item.feedDeductions + item.otherDeductions).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.billFooter}>
                  <View>
                    <Text style={styles.netLabel}>Net Direct Bank Payout</Text>
                    <Text style={styles.netAmount}>
                      ₹{item.netPayableAmount.toFixed(2)}
                    </Text>
                  </View>
                  {item.disbursedDate && (
                    <Text style={styles.disbursedText}>
                      ✓ Paid on {item.disbursedDate}
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
              <Text style={styles.billIdText}>Invoice #{selectedBill.billNumber}</Text>
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
                <Text style={styles.rowLabel}>Other Deductions / Advances</Text>
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

            {selectedBill.disbursedDate && (
              <View style={styles.disbursalBox}>
                <Text style={styles.disbursalTitle}>Bank Settlement Details:</Text>
                <Text style={styles.disbursalDate}>
                  Disbursed directly via NEFT/UPI on {selectedBill.disbursedDate}
                </Text>
              </View>
            )}

            <ClayButton
              title="Close Statement"
              onPress={() => setSelectedBill(null)}
              variant="secondary"
              size="md"
              style={styles.closeBtn}
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
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  billCard: {
    padding: 16,
  },
  billHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cycleLabel: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  billNo: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  billGrid: {
    flexDirection: 'row',
    backgroundColor: DFARM_COLORS.surfaceInset,
    padding: 10,
    borderRadius: DFARM_RADIUS.sm,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
    marginBottom: 12,
  },
  gridItem: {
    flex: 1,
  },
  gridLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontSize: 10,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  gridVal: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  gridValDeduct: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: '#D32F2F',
  },
  billFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: DFARM_COLORS.border,
    paddingTop: 8,
  },
  netLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  netAmount: {
    ...DFARM_TYPOGRAPHY.h2,
    fontWeight: '800',
    color: DFARM_COLORS.primaryOrange,
    marginTop: 2,
  },
  disbursedText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: '#2E7D32',
    fontWeight: '700',
  },
  modalContent: {
    paddingTop: 4,
    gap: 14,
  },
  modalStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billIdText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.secondaryText,
  },
  breakdownTable: {
    backgroundColor: DFARM_COLORS.surfaceInset,
    padding: 14,
    borderRadius: DFARM_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  rowLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  rowVal: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '600',
    color: DFARM_COLORS.primaryText,
  },
  rowValBold: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
  },
  deductVal: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: '#D32F2F',
  },
  netRow: {
    borderTopWidth: 1.5,
    borderTopColor: DFARM_COLORS.border,
    paddingTop: 10,
    marginTop: 4,
  },
  netRowLabel: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  netRowVal: {
    ...DFARM_TYPOGRAPHY.h2,
    fontWeight: '800',
    color: DFARM_COLORS.primaryOrange,
  },
  disbursalBox: {
    backgroundColor: '#E8F5E9',
    borderColor: '#C8E6C9',
    borderWidth: 1,
    padding: 12,
    borderRadius: DFARM_RADIUS.sm,
  },
  disbursalTitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 2,
  },
  disbursalDate: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: '#2E7D32',
  },
  closeBtn: {
    marginTop: 6,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.9,
  },
});
