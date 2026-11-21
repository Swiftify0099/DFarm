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
  ClayEmptyState,
} from '../../design-system';
import { useCollection } from '../../features/collection/useCollection';
import { MilkCollectionRecord } from '../../types/collection';
import { CowIcon } from '../../assets/vectors/CowIcon';
import { BuffaloIcon } from '../../assets/vectors/BuffaloIcon';
import { ShiftSunIcon, ShiftMoonIcon, ReceiptSealIcon } from '../../assets/vectors/NavAssets';

export default function CollectionHistoryScreen() {
  const [animalFilter, setAnimalFilter] = useState<'ALL' | 'COW' | 'BUFFALO'>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<MilkCollectionRecord | null>(null);

  const { collections, isLoadingCollections } = useCollection({
    animalType: animalFilter,
  });

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Milk Collections"
        subtitle="दैनिक सकाळ व संध्याकाळ पाळी संकलन"
      />

      {/* Filter Tabs */}
      <View style={styles.filterSection}>
        <View style={styles.filterRow}>
          {(
            [
              { id: 'ALL', label: 'All Collections', icon: null },
              { id: 'COW', label: 'Cow Milk', icon: <CowIcon size={18} /> },
              { id: 'BUFFALO', label: 'Buffalo Milk', icon: <BuffaloIcon size={18} /> },
            ] as const
          ).map((item) => {
            const isSelected = animalFilter === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setAnimalFilter(item.id)}
                style={({ pressed }) => [
                  styles.filterPill,
                  isSelected && styles.filterPillActive,
                  pressed && styles.pressed,
                ]}
              >
                {item.icon && <View style={styles.filterIconSlot}>{item.icon}</View>}
                <Text
                  style={[
                    styles.filterPillText,
                    isSelected && styles.filterPillTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Collections Stream */}
      {collections.length === 0 ? (
        <ClayEmptyState
          title="No Records Found"
          description="No milk collection transactions match the selected filter."
        />
      ) : (
        <FlatList
          data={collections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedRecord(item)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <ClayCard variant="raised" style={styles.recordCard}>
                <View style={styles.cardTopRow}>
                  <View style={styles.shiftBadgeRow}>
                    {item.shift === 'EVENING' ? (
                      <ShiftMoonIcon size={16} />
                    ) : (
                      <ShiftSunIcon size={16} />
                    )}
                    <Text style={styles.shiftText}>
                      {item.shift} • {item.collectionTime}
                    </Text>
                    <Text style={styles.dateText}>({item.collectionDate})</Text>
                  </View>

                  <ClayBadge
                    label={item.animalType}
                    variant={item.animalType === 'BUFFALO' ? 'buffalo' : 'cow'}
                    icon={
                      item.animalType === 'BUFFALO' ? (
                        <BuffaloIcon size={12} />
                      ) : (
                        <CowIcon size={12} />
                      )
                    }
                  />
                </View>

                <View style={styles.metricsGrid}>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Quantity</Text>
                    <Text style={styles.metricValBold}>
                      {((item.quantityLiters ?? (item as any).weightLiters ?? 0)).toFixed(1)} L
                    </Text>
                  </View>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>FAT / SNF</Text>
                    <Text style={styles.metricVal}>
                      {((item.fatPercentage ?? 0)).toFixed(1)}% / {((item.snfPercentage ?? 0)).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Rate</Text>
                    <Text style={styles.metricVal}>
                      ₹{((item.ratePerLiter ?? (item as any).appliedRatePerLiter ?? 0)).toFixed(2)}/L
                    </Text>
                  </View>
                  <View style={[styles.metricCol, styles.amountCol]}>
                    <Text style={styles.metricLabel}>Total Amount</Text>
                    <Text style={styles.amountBold}>
                      ₹{((item.totalAmount ?? 0)).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.receiptNo}>Receipt #{item.receiptNumber}</Text>
                  <Text style={styles.operatorText}>Officer: {item.operatorName}</Text>
                </View>
              </ClayCard>
            </Pressable>
          )}
        />
      )}

      {/* Detailed Digital Receipt Modal */}
      {selectedRecord && (
        <ClayModal
          visible={!!selectedRecord}
          onClose={() => setSelectedRecord(null)}
          title="Digital Collection Receipt"
          subtitle={`Receipt #${selectedRecord.receiptNumber}`}
        >
          <View style={styles.modalContent}>
            <View style={styles.sealRow}>
              <ReceiptSealIcon size={28} />
              <ClayBadge label="Biometrically Authenticated" variant="success" />
              <Text style={styles.timestampModal}>
                {selectedRecord.collectionDate} • {selectedRecord.collectionTime}
              </Text>
            </View>

            <View style={styles.receiptTable}>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Animal Milk Category</Text>
                <Text style={styles.tableVal}>{selectedRecord.animalType}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Collection Shift</Text>
                <Text style={styles.tableVal}>{selectedRecord.shift}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Net Measured Quantity</Text>
                <Text style={styles.tableValBold}>
                  {((selectedRecord.quantityLiters ?? (selectedRecord as any).weightLiters ?? 0)).toFixed(1)} Liters
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Fat Percentage (FAT)</Text>
                <Text style={styles.tableVal}>
                  {((selectedRecord.fatPercentage ?? 0)).toFixed(1)}%
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Solids-Not-Fat (SNF)</Text>
                <Text style={styles.tableVal}>
                  {((selectedRecord.snfPercentage ?? 0)).toFixed(1)}%
                </Text>
              </View>
              {selectedRecord.lactometerReading != null && (
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>Lactometer Degree</Text>
                  <Text style={styles.tableVal}>
                    {selectedRecord.lactometerReading} CLR
                  </Text>
                </View>
              )}
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Official Applied Rate</Text>
                <Text style={styles.tableVal}>
                  ₹{((selectedRecord.ratePerLiter ?? (selectedRecord as any).appliedRatePerLiter ?? 0)).toFixed(2)} / Liter
                </Text>
              </View>
              <View style={[styles.tableRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Gross Shift Credit</Text>
                <Text style={styles.totalVal}>
                  ₹{((selectedRecord.totalAmount ?? 0)).toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={styles.operatorSignatureBox}>
              <Text style={styles.opLabel}>Certified Collection Officer:</Text>
              <Text style={styles.opName}>
                {selectedRecord.operatorName} ({selectedRecord.operatorId})
              </Text>
            </View>
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
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: DFARM_RADIUS.pill,
    backgroundColor: DFARM_COLORS.surfaceWhite,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
  },
  filterPillActive: {
    backgroundColor: DFARM_COLORS.primaryOrange,
    borderColor: DFARM_COLORS.primaryOrange,
  },
  filterIconSlot: {
    marginRight: 6,
  },
  filterPillText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '600',
    color: DFARM_COLORS.primaryText,
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  recordCard: {
    padding: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  shiftBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shiftText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  dateText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  metricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DFARM_COLORS.surfaceInset,
    padding: 10,
    borderRadius: DFARM_RADIUS.sm,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
    marginBottom: 10,
  },
  metricCol: {
    flex: 1,
  },
  amountCol: {
    flex: 1.2,
    alignItems: 'flex-end',
  },
  metricLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontSize: 10,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  metricValBold: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
  },
  metricVal: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  amountBold: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '800',
    color: DFARM_COLORS.primaryOrange,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: DFARM_COLORS.border,
    paddingTop: 8,
  },
  receiptNo: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  operatorText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  modalContent: {
    paddingTop: 4,
    gap: 14,
  },
  sealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  timestampModal: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginLeft: 'auto',
  },
  receiptTable: {
    backgroundColor: DFARM_COLORS.surfaceInset,
    padding: 14,
    borderRadius: DFARM_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    gap: 8,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  tableLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  tableVal: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '600',
    color: DFARM_COLORS.primaryText,
  },
  tableValBold: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
  },
  totalRow: {
    borderTopWidth: 1.5,
    borderTopColor: DFARM_COLORS.border,
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  totalVal: {
    ...DFARM_TYPOGRAPHY.h3,
    fontWeight: '800',
    color: DFARM_COLORS.primaryOrange,
  },
  operatorSignatureBox: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: DFARM_RADIUS.sm,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
  },
  opLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  opName: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
    marginTop: 2,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.9,
  },
});
