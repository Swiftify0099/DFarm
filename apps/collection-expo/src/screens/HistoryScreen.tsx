import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { CollectionRepository } from '../domain/repository/CollectionRepository';
import { CollectionHistoryItemDto, Shift, ShiftSummaryDto } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ClayCard } from '../components/clay/ClayCard';
import { ClayButton } from '../components/clay/ClayButton';
import { ClayInput } from '../components/clay/ClayInput';
import { ClayFilterChip } from '../components/clay/ClayFilterChip';
import { ClayDialog } from '../components/clay/ClayDialog';
import { ClayCategoryBadge } from '../components/clay/ClayCategoryBadge';
import { ClayEmptyState } from '../components/clay/ClayEmptyState';
import { ClayLoading } from '../components/clay/ClayLoading';
import { ReceiptFormatter } from '../domain/receipt/ReceiptFormatter';
import { ClayImages } from '../theme/assets';

interface HistoryScreenProps {
  repository: CollectionRepository;
  currentShift: Shift;
  onDone: () => void;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  repository,
  currentShift,
  onDone,
}) => {
  const [historyItems, setHistoryItems] = useState<CollectionHistoryItemDto[]>([]);
  const [shiftSummary, setShiftSummary] = useState<ShiftSummaryDto | null>(null);
  const [selectedShiftFilter, setSelectedShiftFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [centerName, setCenterName] = useState('Center');
  const [selectedReceiptText, setSelectedReceiptText] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setIsLoading(true);
      const name = await repository.getActiveCenterName();
      const items = await repository.getCollectionHistory();
      const summary = await repository.getShiftSummary(currentShift, '');
      if (isMounted) {
        setCenterName(name);
        setHistoryItems(items);
        setShiftSummary(summary);
        setIsLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [currentShift]);

  const filteredItems = historyItems.filter((item) => {
    const matchesShift =
      selectedShiftFilter === 'ALL' ||
      item.shift_type.toUpperCase() === selectedShiftFilter.toUpperCase();
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      q.length === 0 ||
      (item.farmer_code && item.farmer_code.toLowerCase().includes(q)) ||
      (item.customer_name && item.customer_name.toLowerCase().includes(q));
    return matchesShift && matchesSearch;
  });

  const handleOpenReceipt = async (col: CollectionHistoryItemDto) => {
    const receipt = {
      receiptNumber: `RCP-${col.id.slice(0, 8).toUpperCase()}`,
      sessionUuid: col.id,
      businessDate: col.business_date,
      shift: (col.shift_type.toUpperCase() as Shift) || 'MORNING',
      centerName,
      operatorName: await repository.getOfficerName(),
      customerCode: col.farmer_code || 'FARMER',
      customerName: col.customer_name || 'Farmer',
      identificationMethod: 'RFID' as const,
      milkCategory: (col.selected_milk_category.toUpperCase() as any) || 'COW',
      weightKg: col.net_weight || 0,
      fatPercentage: col.fat_percentage || 0,
      snfPercentage: col.snf_percentage || 0,
      ratePerUnit: col.applied_rate_per_unit || 0,
      totalAmount: col.total_amount || 0,
      timestamp: Date.now(),
      verificationHash: `VERIFIED-${col.id.slice(0, 8)}`,
    };
    setSelectedReceiptText(ReceiptFormatter.generateReceiptText(receipt));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={typography.headlineMedium}>SHIFT COLLECTIONS &amp; HISTORY</Text>
          <Text style={[typography.bodyMedium, { marginTop: 4 }]}>
            📍 Center: {centerName} | ☀️ Shift: {currentShift}
          </Text>
        </View>

        <ClayButton
          title="BACK TO DASHBOARD"
          onPress={onDone}
          variant="secondary"
          size="md"
        />
      </View>

      <View style={{ height: 16 }} />

      {/* 3D Shift Summary Banner Card */}
      {shiftSummary && (
        <ClayCard variant="elevated" style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>SESSION METRICS SUMMARY</Text>
          <View style={styles.summaryStatsRow}>
            <View style={styles.statWell}>
              <Text style={styles.statLabel}>COLLECTIONS</Text>
              <Text style={[typography.titleLarge, styles.statValue]}>
                {shiftSummary.totalCollections}
              </Text>
            </View>

            <View style={styles.statWell}>
              <Text style={styles.statLabel}>TOTAL QUANTITY</Text>
              <Text style={[typography.titleLarge, styles.statValue]}>
                {shiftSummary.totalWeightKg.toFixed(2)} KG
              </Text>
            </View>

            <View style={styles.statWell}>
              <Text style={styles.statLabel}>AVG FAT / SNF</Text>
              <Text style={[typography.titleLarge, styles.statValue]}>
                {shiftSummary.averageFat.toFixed(1)}% / {shiftSummary.averageSnf.toFixed(1)}%
              </Text>
            </View>

            <View style={[styles.statWell, styles.statWellPayable]}>
              <Text style={styles.statLabel}>TOTAL PAYABLE</Text>
              <Text style={[typography.titleLarge, { color: colors.statusValid, fontWeight: '800' }]}>
                INR {shiftSummary.totalAmount.toFixed(2)}
              </Text>
            </View>
          </View>
        </ClayCard>
      )}

      <View style={{ height: 16 }} />

      {/* Search & Filter Controls */}
      <View style={styles.controlsRow}>
        <View style={{ flex: 1, minWidth: 260 }}>
          <ClayInput
            placeholder="Search Farmer Code or Name"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View style={styles.chipsRow}>
          <ClayFilterChip
            label="ALL SHIFTS"
            selected={selectedShiftFilter === 'ALL'}
            onPress={() => setSelectedShiftFilter('ALL')}
          />
          <ClayFilterChip
            label="MORNING"
            selected={selectedShiftFilter === 'MORNING'}
            onPress={() => setSelectedShiftFilter('MORNING')}
          />
          <ClayFilterChip
            label="EVENING"
            selected={selectedShiftFilter === 'EVENING'}
            onPress={() => setSelectedShiftFilter('EVENING')}
          />
        </View>
      </View>

      <View style={{ height: 16 }} />

      {/* List / Loading / Empty */}
      {isLoading ? (
        <ClayLoading message="Loading shift history..." />
      ) : filteredItems.length === 0 ? (
        <ClayEmptyState
          imageSource={ClayImages.emptyState}
          title="No Collections Found"
          description={
            searchQuery.trim()
              ? `No records match '${searchQuery}' in ${selectedShiftFilter} shift.`
              : 'No collections have been recorded yet for this shift.'
          }
        />
      ) : (
        <View style={styles.listContainer}>
          {filteredItems.map((col) => (
            <ClayCard
              key={col.id}
              variant="elevated"
              style={styles.itemCard}
              onPress={() => handleOpenReceipt(col)}
            >
              <View style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.itemTitleRow}>
                    <Text style={[typography.bodyLarge, { fontWeight: '800' }]}>
                      {col.customer_name}
                    </Text>
                    <Text style={styles.itemCodeTag}>({col.farmer_code})</Text>
                  </View>

                  <View style={styles.itemMetaRow}>
                    <ClayCategoryBadge category={col.selected_milk_category} size="sm" />
                    <Text style={styles.itemMetaText}>
                      {col.shift_type} &bull; {col.business_date}
                    </Text>
                  </View>
                </View>

                <View style={styles.itemRight}>
                  <Text style={styles.rateText}>
                    {(col.net_weight || 0).toFixed(2)} KG @ INR {(col.applied_rate_per_unit || 0).toFixed(2)}
                  </Text>
                  <Text style={styles.amountText}>
                    INR {(col.total_amount || 0).toFixed(2)}
                  </Text>
                  <Text style={styles.viewSlipHint}>VIEW SLIP &rarr;</Text>
                </View>
              </View>
            </ClayCard>
          ))}
        </View>
      )}

      {/* Receipt Modal Dialog */}
      <ClayDialog
        visible={selectedReceiptText !== null}
        onDismiss={() => setSelectedReceiptText(null)}
        title="Thermal Receipt Slip"
        subtitle="40-Column Historical Digital Record"
      >
        <View>
          <View style={styles.dialogReceiptBox}>
            <Text style={typography.monospaceReceipt}>{selectedReceiptText}</Text>
          </View>
          <View style={{ height: 16 }} />
          <ClayButton
            title="CLOSE"
            onPress={() => setSelectedReceiptText(null)}
            variant="primary"
            size="md"
          />
        </View>
      </ClayDialog>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.clayBgDark,
  },
  content: {
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  summaryCard: {
    padding: 18,
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  statWell: {
    flex: 1,
    minWidth: 120,
    backgroundColor: colors.clayInsetBg,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopColor: colors.clayInsetBorderTop,
    borderLeftColor: colors.clayInsetBorderTop,
    borderBottomColor: colors.clayInsetBorderBottom,
    borderRightColor: colors.clayInsetBorderBottom,
  },
  statWellPayable: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  statValue: {
    fontWeight: '800',
    color: colors.textPrimary,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  listContainer: {
    gap: 10,
  },
  itemCard: {
    padding: 16,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  itemCodeTag: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accentAmber,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemMetaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  rateText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.statusValid,
  },
  viewSlipHint: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.clayBlueLight,
    marginTop: 4,
    letterSpacing: 0.4,
  },
  dialogReceiptBox: {
    backgroundColor: colors.clayInsetBg,
    borderRadius: 12,
    padding: 16,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopColor: colors.clayInsetBorderTop,
    borderLeftColor: colors.clayInsetBorderTop,
    borderBottomColor: colors.clayInsetBorderBottom,
    borderRightColor: colors.clayInsetBorderBottom,
  },
});
