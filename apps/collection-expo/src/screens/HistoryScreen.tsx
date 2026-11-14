import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { CollectionRepository } from '../domain/repository/CollectionRepository';
import { CollectionHistoryItemDto, Shift, ShiftSummaryDto } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { FilterChip } from '../components/common/FilterChip';
import { Dialog } from '../components/common/Dialog';
import { ReceiptFormatter } from '../domain/receipt/ReceiptFormatter';

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
      {/* Top Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={typography.headlineMedium}>SHIFT COLLECTIONS & HISTORY</Text>
          <Text style={[typography.bodyMedium, { marginTop: 4 }]}>
            Center: {centerName} | Shift: {currentShift}
          </Text>
        </View>

        <Button
          title="BACK TO DASHBOARD"
          onPress={onDone}
          variant="primary"
          style={styles.backBtn}
        />
      </View>

      <View style={{ height: 16 }} />

      {/* Shift Summary Banner */}
      {shiftSummary && (
        <Card style={styles.summaryCard} backgroundColor={colors.surfaceDark}>
          <View style={styles.summaryStatsRow}>
            <View style={styles.statColumn}>
              <Text style={styles.statLabel}>Collections</Text>
              <Text style={typography.titleLarge}>{shiftSummary.totalCollections}</Text>
            </View>
            <View style={styles.statColumn}>
              <Text style={styles.statLabel}>Total Weight</Text>
              <Text style={typography.titleLarge}>{shiftSummary.totalWeightKg.toFixed(2)} KG</Text>
            </View>
            <View style={styles.statColumn}>
              <Text style={styles.statLabel}>Avg Fat / SNF</Text>
              <Text style={typography.titleLarge}>
                {shiftSummary.averageFat.toFixed(1)}% / {shiftSummary.averageSnf.toFixed(1)}%
              </Text>
            </View>
            <View style={styles.statColumn}>
              <Text style={styles.statLabel}>Total Payable</Text>
              <Text style={[typography.titleLarge, { color: colors.statusValid }]}>
                INR {shiftSummary.totalAmount.toFixed(2)}
              </Text>
            </View>
          </View>
        </Card>
      )}

      <View style={{ height: 16 }} />

      {/* Search & Filter Controls */}
      <View style={styles.controlsRow}>
        <Input
          placeholder="Search Farmer Code or Name"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{ flex: 1, minWidth: 240 }}
        />

        <View style={styles.chipsRow}>
          <FilterChip
            label="ALL SHIFTS"
            selected={selectedShiftFilter === 'ALL'}
            onPress={() => setSelectedShiftFilter('ALL')}
          />
          <FilterChip
            label="MORNING"
            selected={selectedShiftFilter === 'MORNING'}
            onPress={() => setSelectedShiftFilter('MORNING')}
          />
          <FilterChip
            label="EVENING"
            selected={selectedShiftFilter === 'EVENING'}
            onPress={() => setSelectedShiftFilter('EVENING')}
          />
        </View>
      </View>

      <View style={{ height: 16 }} />

      {/* List / Loading / Empty */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primaryLight} />
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No collections found matching criteria.</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {filteredItems.map((col) => (
            <Card
              key={col.id}
              style={styles.itemCard}
              backgroundColor={colors.surfaceDark}
              onPress={() => handleOpenReceipt(col)}
            >
              <View style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyLarge, { fontWeight: 'bold' }]}>
                    {col.customer_name} ({col.farmer_code})
                  </Text>
                  <Text style={[typography.caption, { marginTop: 4 }]}>
                    {col.selected_milk_category} | {col.shift_type} | {col.business_date}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rateText}>
                    {(col.net_weight || 0).toFixed(2)} KG @ INR {(col.applied_rate_per_unit || 0).toFixed(2)}
                  </Text>
                  <Text style={[typography.bodyLarge, { color: colors.statusValid, fontWeight: 'bold' }]}>
                    INR {(col.total_amount || 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}

      {/* Receipt Modal Dialog */}
      <Dialog
        visible={selectedReceiptText !== null}
        onDismiss={() => setSelectedReceiptText(null)}
      >
        <View>
          <Text style={typography.monospaceReceipt}>{selectedReceiptText}</Text>
          <View style={{ height: 16 }} />
          <Button
            title="CLOSE"
            onPress={() => setSelectedReceiptText(null)}
            variant="primary"
            style={{ width: '100%' }}
          />
        </View>
      </Dialog>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
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
  backBtn: {
    height: 44,
    paddingHorizontal: 16,
  },
  summaryCard: {
    padding: 16,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 16,
  },
  statColumn: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  centered: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  listContainer: {
    gap: 8,
  },
  itemCard: {
    padding: 16,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rateText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
});
