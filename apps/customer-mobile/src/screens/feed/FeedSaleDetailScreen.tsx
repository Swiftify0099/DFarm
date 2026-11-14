import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { colors } from '../../components/theme/colors';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { feedApi, FeedSaleData } from '../../api/feed.api';
import { formatCurrency } from '../../utils/currency';
import { formatDateShort } from '../../utils/date';

export interface FeedSaleDetailScreenProps {
  route: {
    params: {
      saleId: string;
      invoiceNumber: string;
    };
  };
  navigation: any;
}

export const FeedSaleDetailScreen: React.FC<FeedSaleDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const { saleId, invoiceNumber } = route.params;
  const [sale, setSale] = useState<FeedSaleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadSaleDetail() {
      try {
        const response = await feedApi.getFeedSaleDetails(saleId);
        setSale(response);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to retrieve invoice details');
      } finally {
        setLoading(false);
      }
    }
    loadSaleDetail();
  }, [saleId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <LoadingSpinner message="Fetching feed invoice..." fullScreen />
        ) : errorMsg || !sale ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Invoice Unavailable</Text>
            <Text style={styles.errorDesc}>{errorMsg || 'Could not find invoice'}</Text>
            <Button
              title="Go Back"
              variant="outline"
              onPress={() => navigation.goBack()}
              style={{ marginTop: 16 }}
            />
          </View>
        ) : (
          <View>
            {/* Invoice Top Card */}
            <Card variant="elevated" style={styles.mainCard}>
              <View style={styles.topRow}>
                <View>
                  <Text style={styles.invoiceTitle}>Invoice #{sale.invoiceNumber}</Text>
                  <Text style={styles.saleDateText}>{formatDateShort(sale.saleDate)}</Text>
                </View>
                <Badge
                  label={sale.paymentMode}
                  variant={sale.paymentMode === 'CREDIT' ? 'warning' : 'success'}
                  size="md"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Receipt No</Text>
                  <Text style={styles.metaVal}>{sale.receiptNumber || '---'}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Status</Text>
                  <Text style={styles.metaVal}>{sale.status}</Text>
                </View>
              </View>

              {sale.paymentMode === 'CREDIT' && (
                <View style={styles.creditNotice}>
                  <Text style={styles.creditNoticeTitle}>💳 Billed On Credit</Text>
                  <Text style={styles.creditNoticeDesc}>
                    This purchase was debited directly to your dairy farmer account balance.
                  </Text>
                </View>
              )}
            </Card>

            {/* Itemized Products */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Purchased Items</Text>
            </View>

            {sale.items && sale.items.length > 0 ? (
              sale.items.map((item, idx) => (
                <Card key={item.id || idx} variant="flat" style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.productName}>
                      {item.product?.name || `Feed Product #${idx + 1}`}
                    </Text>
                    <Text style={styles.itemTotalAmount}>
                      {formatCurrency(item.totalAmount)}
                    </Text>
                  </View>

                  <View style={styles.itemSubRow}>
                    <Text style={styles.itemQtyUnit}>
                      {item.quantity} {item.unit || item.product?.packUnit || 'Unit'}
                      {item.product?.packSize ? ` (${item.product.packSize} ${item.product.packUnit})` : ''}
                    </Text>
                    <Text style={styles.itemUnitPrice}>
                      @ {formatCurrency(item.unitPrice)} / {item.unit || 'unit'}
                    </Text>
                  </View>

                  {item.taxAmount > 0 && (
                    <Text style={styles.itemTax}>Tax/GST: {formatCurrency(item.taxAmount)}</Text>
                  )}
                </Card>
              ))
            ) : (
              <Card variant="flat" style={styles.emptyItemsCard}>
                <Text style={styles.emptyItemsText}>Invoice itemization not available.</Text>
              </Card>
            )}

            {/* Financial Summary */}
            <Card variant="flat" style={styles.summaryCard}>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>Subtotal</Text>
                <Text style={styles.sumVal}>{formatCurrency(sale.subtotal)}</Text>
              </View>

              {sale.discountAmount > 0 && (
                <View style={styles.sumRow}>
                  <Text style={[styles.sumLabel, { color: colors.success }]}>Discount</Text>
                  <Text style={[styles.sumVal, { color: colors.success }]}>
                    - {formatCurrency(sale.discountAmount)}
                  </Text>
                </View>
              )}

              {sale.taxAmount > 0 && (
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>Taxes & Cess</Text>
                  <Text style={styles.sumVal}>+ {formatCurrency(sale.taxAmount)}</Text>
                </View>
              )}

              <View style={styles.boldDivider} />

              <View style={styles.sumRow}>
                <Text style={styles.finalTotalLabel}>Grand Total</Text>
                <Text style={styles.finalTotalVal}>{formatCurrency(sale.totalAmount)}</Text>
              </View>
            </Card>

            <Button
              title="Close"
              variant="secondary"
              onPress={() => navigation.goBack()}
              style={{ marginTop: 20 }}
            />
          </View>
        )}
      </ScrollView>
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
  mainCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: colors.card,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  invoiceTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  saleDateText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 12,
  },
  metaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  metaVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  creditNotice: {
    marginTop: 12,
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
  },
  creditNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  creditNoticeDesc: {
    fontSize: 11,
    color: '#92400E',
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemCard: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  itemTotalAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  itemQtyUnit: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  itemUnitPrice: {
    fontSize: 12,
    color: colors.textMuted,
  },
  itemTax: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  emptyItemsCard: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyItemsText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.card,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sumLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  sumVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  boldDivider: {
    height: 2,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  finalTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  finalTotalVal: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  errorBox: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  errorDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
});
