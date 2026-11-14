import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { colors } from '../../components/theme/colors';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { paymentsApi, CustomerPayoutItem } from '../../api/payments.api';
import { formatCurrency } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';

export interface PaymentDetailScreenProps {
  route: {
    params: {
      payoutId: string;
      payoutItem?: CustomerPayoutItem;
    };
  };
  navigation: any;
}

export const PaymentDetailScreen: React.FC<PaymentDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const { payoutId, payoutItem: initialItem } = route.params;
  const [payout, setPayout] = useState<CustomerPayoutItem | null>(initialItem || null);
  const [receiptText, setReceiptText] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialItem);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    async function loadReceipt() {
      try {
        const text = await paymentsApi.getPayoutReceiptSlip(payoutId);
        setReceiptText(text);
      } catch (err) {
        // Receipt text fallback
      } finally {
        setLoading(false);
      }
    }
    loadReceipt();
  }, [payoutId]);

  const handlePrintSlip = async () => {
    if (!payout) return;
    setIsPrinting(true);
    try {
      const html = `
        <html>
          <head>
            <style>
              body { font-family: monospace; font-size: 14px; padding: 20px; line-height: 1.6; }
              .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; }
              .row { display: flex; justify-content: space-between; margin: 8px 0; }
              .bold { font-weight: bold; }
              .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>DFARM MILK DISBURSEMENT RECEIPT</h2>
              <p>Payout Voucher #${payout.id.substring(0, 8)}</p>
            </div>
            <div class="row"><span>Status:</span><span class="bold">${payout.status}</span></div>
            <div class="row"><span>Method:</span><span>${payout.payment_method}</span></div>
            <div class="row"><span>Bank Account:</span><span>${payout.bank_account_mask || 'Registered Bank'}</span></div>
            <div class="row"><span>Reference (UTR):</span><span class="bold">${payout.reference_number || 'N/A'}</span></div>
            <div class="row"><span>Settled Date:</span><span>${payout.settled_at || payout.created_at}</span></div>
            <div class="divider"></div>
            <div class="row bold"><span>Disbursed Amount:</span><span>₹${payout.amount.toFixed(2)}</span></div>
            <div class="divider"></div>
            <p style="text-align: center; font-size: 11px;">Authoritative DFarm Electronic Payment Record</p>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Payment Receipt #${payout.id.substring(0, 8)}`,
        });
      } else {
        Alert.alert('Sharing Unavailable', 'File sharing is not supported on this device');
      }
    } catch (err: any) {
      Alert.alert('Print Error', err.message || 'Failed to print payment receipt');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <LoadingSpinner message="Fetching payment voucher..." fullScreen />
        ) : payout ? (
          <View>
            <Card variant="elevated" style={styles.voucherCard}>
              <View style={styles.header}>
                <View style={styles.iconCircle}>
                  <Text style={styles.iconEmoji}>₹</Text>
                </View>
                <Text style={styles.amountText}>{formatCurrency(payout.amount)}</Text>
                <Text style={styles.directionText}>
                  {payout.direction === 'DAIRY_PAYS_CUSTOMER'
                    ? 'Disbursement to Farmer'
                    : 'Collection from Customer'}
                </Text>
                <Badge
                  label={payout.status}
                  variant={payout.status === 'SETTLED' ? 'success' : 'warning'}
                  size="md"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Disbursement ID</Text>
                <Text style={styles.detailVal}>{payout.id}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Payment Method</Text>
                <Text style={styles.detailVal}>{payout.payment_method}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Bank Account</Text>
                <Text style={styles.detailVal}>{payout.bank_account_mask || 'Registered Bank'}</Text>
              </View>

              {payout.reference_number && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Bank Reference (UTR)</Text>
                  <Text style={[styles.detailVal, styles.boldVal]}>{payout.reference_number}</Text>
                </View>
              )}

              {payout.batch_id && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Payment Batch</Text>
                  <Text style={styles.detailVal}>{payout.batch_id.substring(0, 8)}</Text>
                </View>
              )}

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Initiated On</Text>
                <Text style={styles.detailVal}>{formatDateTime(payout.created_at)}</Text>
              </View>

              {payout.settled_at && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Settled On</Text>
                  <Text style={styles.detailVal}>{formatDateTime(payout.settled_at)}</Text>
                </View>
              )}

              {payout.failure_reason && (
                <View style={styles.failureBox}>
                  <Text style={styles.failTitle}>Bank Rejection / Failure Reason</Text>
                  <Text style={styles.failDesc}>{payout.failure_reason}</Text>
                </View>
              )}
            </Card>

            <View style={styles.btnRow}>
              <Button
                title="🖨️ Export / Share Receipt"
                variant="primary"
                onPress={handlePrintSlip}
                loading={isPrinting}
                style={styles.actionBtn}
              />
              <Button
                title="Back"
                variant="secondary"
                onPress={() => navigation.goBack()}
                style={styles.actionBtn}
              />
            </View>
          </View>
        ) : (
          <Text style={styles.notFound}>Payment record not found.</Text>
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
  voucherCard: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.card,
    marginBottom: 20,
  },
  header: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  iconEmoji: {
    fontSize: 26,
    color: '#15803D',
    fontWeight: '800',
  },
  amountText: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  directionText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  detailVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  boldVal: {
    fontWeight: '700',
    color: colors.primary,
  },
  failureBox: {
    marginTop: 12,
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
  },
  failTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
  },
  failDesc: {
    fontSize: 11,
    color: '#B91C1C',
    marginTop: 2,
  },
  btnRow: {
    gap: 10,
  },
  actionBtn: {
    width: '100%',
  },
  notFound: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 40,
  },
});
