import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { colors } from '../../components/theme/colors';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { OfflineBanner } from '../../components/common/OfflineBanner';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import {
  collectionsApi,
  CustomerCollectionItem,
  CollectionFilters,
} from '../../api/collections.api';
import { formatCurrency } from '../../utils/currency';
import { formatWeightKg } from '../../utils/units';
import { formatDateShort } from '../../utils/date';

export interface MilkHistoryScreenProps {
  navigation: any;
}

export const MilkHistoryScreen: React.FC<MilkHistoryScreenProps> = ({ navigation }) => {
  const { currentCustomer, session } = useAuth();
  const { isOnline } = useNetwork();
  const customerId = currentCustomer?.id || session?.customer_id;

  const [collections, setCollections] = useState<CustomerCollectionItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'COW' | 'BUFFALO'>('ALL');
  const [selectedShift, setSelectedShift] = useState<'ALL' | 'MORNING' | 'EVENING'>('ALL');

  const fetchCollections = useCallback(async () => {
    if (!customerId) return;
    try {
      const filters: CollectionFilters = {
        limit: 50,
      };
      if (selectedCategory !== 'ALL') {
        filters.category = selectedCategory;
      }
      if (selectedShift !== 'ALL') {
        filters.shift = selectedShift;
      }

      const response = await collectionsApi.getCustomerCollections(customerId, filters);
      setCollections(response.data.collections || []);
      setTotalCount(response.data.total || 0);
      setIsFromCache(response.fromCache);
      setLastSyncedAt(response.syncedAt);
    } catch (err) {
      console.error('Failed to load collections:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId, selectedCategory, selectedShift]);

  useEffect(() => {
    setLoading(true);
    fetchCollections();
  }, [fetchCollections]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCollections();
  };

  const renderItem = ({ item }: { item: CustomerCollectionItem }) => {
    const isCow = item.milkCategory === 'COW';

    return (
      <Card
        variant="elevated"
        style={styles.collectionCard}
        onPress={() =>
          navigation.navigate('CollectionDetail', {
            sessionId: item.sessionId,
            receiptNumber: item.receiptNumber,
          })
        }
      >
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <Text style={styles.dateText}>{formatDateShort(item.businessDate)}</Text>
            <Text style={styles.receiptNo}>Receipt #{item.receiptNumber}</Text>
          </View>
          <View style={styles.badgeRow}>
            <Badge
              label={item.shiftType}
              variant={item.shiftType === 'MORNING' ? 'warning' : 'info'}
              size="sm"
            />
            <Badge
              label={item.milkCategory}
              variant={isCow ? 'info' : 'success'}
              size="sm"
            />
          </View>
        </View>

        <View style={styles.metricsContainer}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Weight ({item.measurementUnit || 'KG'})</Text>
            <Text style={styles.weightValue}>{formatWeightKg(item.netWeight)}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Fat / SNF</Text>
            <Text style={styles.metricValue}>
              {item.fatPercentage?.toFixed(1)}% / {item.snfPercentage?.toFixed(1)}%
            </Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Rate</Text>
            <Text style={styles.metricValue}>₹{item.appliedRatePerUnit?.toFixed(2)}</Text>
          </View>
          <View style={[styles.metricCol, { alignItems: 'flex-end' }]}>
            <Text style={styles.metricLabel}>Total</Text>
            <Text style={styles.amountValue}>{formatCurrency(item.totalAmount)}</Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner
        isOnline={isOnline}
        isCachedData={isFromCache}
        lastSyncedAt={lastSyncedAt || undefined}
      />

      {/* Filter Section */}
      <View style={styles.filtersWrapper}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Type:</Text>
          {(['ALL', 'COW', 'BUFFALO'] as const).map(cat => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.filterChip,
                selectedCategory === cat && styles.filterChipActive,
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCategory === cat && styles.filterChipTextActive,
                ]}
              >
                {cat === 'ALL' ? 'All Milk' : cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Shift:</Text>
          {(['ALL', 'MORNING', 'EVENING'] as const).map(sh => (
            <TouchableOpacity
              key={sh}
              style={[
                styles.filterChip,
                selectedShift === sh && styles.filterChipActive,
              ]}
              onPress={() => setSelectedShift(sh)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedShift === sh && styles.filterChipTextActive,
                ]}
              >
                {sh === 'ALL' ? 'All Shifts' : sh}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <LoadingSpinner message="Loading delivery history..." fullScreen />
      ) : (
        <FlatList
          data={collections}
          keyExtractor={item => item.sessionId || item.receiptNumber}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="🥛"
              title="No Milk Deliveries Found"
              message="No milk collections match your selected category and shift filters."
              actionLabel="Reset Filters"
              onAction={() => {
                setSelectedCategory('ALL');
                setSelectedShift('ALL');
              }}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filtersWrapper: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 8,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    width: 44,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  collectionCard: {
    padding: 14,
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerLeft: {
    flex: 1,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  receiptNo: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  weightValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  amountValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.success,
  },
});
