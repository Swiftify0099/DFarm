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
        subtitle="Daily Morning & Evening Shift Records"
      />

      {/* Filter Tabs */}
      <View style={styles.filterSection}>
        <View style={styles.filterRow}>
          {(['ALL', 'COW', 'BUFFALO'] as const).map((type) => {
            const isSelected = animalFilter === type;
            return (
              <Pressable
                key={type}
                onPress={() => setAnimalFilter(type)}
                style={[
                  styles.filterPill,
                  isSelected && styles.filterPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isSelected && styles.filterPillTextActive,
                  ]}
                >
                  {type === 'ALL'
                    ? 'All Collections'
                    : type === 'COW'
                    ? '🐄 Cow Milk'
                    : '🐃 Buffalo Milk'}
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
          renderItem={({ item }) => (
            <Pressable onPress={() => setSelectedRecord(item)}>
              <ClayCard variant="raised" style={styles.recordCard}>
                <View style={styles.cardTopRow}>
                  <View style={styles.shiftBadgeRow}>
                    <Text style={styles.shiftIcon}>
                      {item.shift === 'MORNING' ? '☀️' : '🌙'}
                    </Text>
                    <Text style={styles.shiftText}>
                      {item.shift} • {item.collectionTime}
                    </Text>
                    <Text style={styles.dateText}>({item.collectionDate})</Text>
                  </View>

                  <ClayBadge
                    label={item.animalType}
                    variant={item.animalType === 'BUFFALO' ? 'buffalo' : 'cow'}
                  />
                </View>

                <View style={styles.metricsGrid}>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Quantity</Text>
                    <Text style={styles.metricValBold}>
                      {item.quantityLiters.toFixed(1)} L
                    </Text>
                  </View>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>FAT / SNF</Text>
                    <Text style={styles.metricVal}>
                      {item.fatPercentage}% / {item.snfPercentage}%
                    </Text>
                  </View>
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Rate</Text>
                    <Text style={styles.metricVal}>₹{item.ratePerLiter}/L</Text>
                  </View>
                  <View style={[styles.metricCol, styles.amountCol]}>
                    <Text style={styles.metricLabel}>Total Amount</Text>
                    <Text style={styles.amountBold}>
                      ₹{item.totalAmount.toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.receiptNo}>Receipt: #{item.receiptNumber}</Text>
                  <Text style={styles.operatorText}>👤 {item.operatorName}</Text>
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
              <ClayBadge label="Biometrically Verified" variant="success" />
              <Text style={styles.timestampModal}>
                {selectedRecord.collectionDate} at {selectedRecord.collectionTime}
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
                  {selectedRecord.quantityLiters} Liters
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Fat Percentage (FAT)</Text>
                <Text style={styles.tableVal}>{selectedRecord.fatPercentage}%</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Solids-Not-Fat (SNF)</Text>
                <Text style={styles.tableVal}>{selectedRecord.snfPercentage}%</Text>
              </View>
              {selectedRecord.lactometerReading && (
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
                  ₹{selectedRecord.ratePerLiter} / Liter
                </Text>
              </View>
              <View style={[styles.tableRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Gross Shift Payout</Text>
                <Text style={styles.totalVal}>
                  ₹{selectedRecord.totalAmount.toFixed(2)}
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
  },
  filterPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: DFARM_RADIUS.pill,
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    marginRight: 8,
  },
  filterPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: DFARM_COLORS.primaryOrange,
  },
  filterPillText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '600',
    color: DFARM_COLORS.secondaryText,
  },
  filterPillTextActive: {
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 84,
  },
  recordCard: {
    marginBottom: 12,
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  shiftBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shiftIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  shiftText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
    marginRight: 4,
  },
  dateText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: DFARM_COLORS.border,
  },
  metricCol: {
    flex: 1,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  metricVal: {
    fontSize: 13,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  metricValBold: {
    fontSize: 14,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
  },
  amountBold: {
    fontSize: 15,
    fontWeight: '800',
    color: DFARM_COLORS.primaryOrange,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    paddingVertical: 4,
  },
  sealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  timestampModal: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  receiptTable: {
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: DFARM_RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
    marginBottom: 16,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  tableLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  tableVal: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '600',
    color: DFARM_COLORS.primaryText,
  },
  tableValBold: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
  },
  totalRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: DFARM_COLORS.border,
  },
  totalLabel: {
    ...DFARM_TYPOGRAPHY.bodyLg,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  totalVal: {
    ...DFARM_TYPOGRAPHY.h2,
    color: DFARM_COLORS.primaryOrange,
  },
  operatorSignatureBox: {
    padding: 12,
    backgroundColor: DFARM_COLORS.peach,
    borderRadius: DFARM_RADIUS.sm,
  },
  opLabel: {
    fontSize: 11,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  opName: {
    fontSize: 13,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
});
