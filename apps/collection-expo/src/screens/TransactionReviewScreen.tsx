import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Customer, MilkCategory, RateCalculationResult } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ClayCard } from '../components/clay/ClayCard';
import { ClayButton } from '../components/clay/ClayButton';
import { ClayAlert } from '../components/clay/ClayAlert';
import { ClayCategoryBadge } from '../components/clay/ClayCategoryBadge';

interface TransactionReviewScreenProps {
  customer: Customer;
  category: MilkCategory;
  netWeight: number;
  fat: number;
  snf: number;
  rateCalculation: RateCalculationResult;
  isLoading: boolean;
  errorMessage?: string | null;
  onConfirmCommit: () => void;
  onCancelSession: () => void;
}

export const TransactionReviewScreen: React.FC<TransactionReviewScreenProps> = ({
  customer,
  category,
  netWeight,
  fat,
  snf,
  rateCalculation,
  isLoading,
  errorMessage,
  onConfirmCommit,
  onCancelSession,
}) => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[typography.headlineMedium, { textAlign: 'center' }]}>
        TRANSACTION REVIEW &amp; PRICING
      </Text>
      <Text style={[typography.bodyMedium, { textAlign: 'center', marginTop: 4, marginBottom: 16 }]}>
        Verify intake measurements and matrix pricing before committing to ledger
      </Text>

      {errorMessage && (
        <ClayAlert
          type="error"
          title="Commit Failure"
          message={errorMessage}
          style={{ maxWidth: 560 }}
        />
      )}

      {/* Main Review Card */}
      <ClayCard variant="elevated" style={styles.card}>
        {/* Customer Header Info */}
        <View style={styles.customerHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.farmerCodeTag}>{customer.farmerCode}</Text>
            <Text style={typography.headlineMedium}>{customer.fullName}</Text>
            {customer.mobileNumber ? (
              <Text style={styles.mobileText}>📱 {customer.mobileNumber}</Text>
            ) : null}
          </View>
          <ClayCategoryBadge category={category} size="md" />
        </View>

        <View style={styles.divider} />

        {/* Measurements Grid */}
        <View style={styles.measurementRow}>
          <View style={styles.measureWell}>
            <Text style={styles.measureLabel}>NET WEIGHT</Text>
            <Text style={styles.measureValue}>{netWeight.toFixed(2)}</Text>
            <Text style={styles.measureUnit}>KG</Text>
          </View>

          <View style={styles.measureWell}>
            <Text style={styles.measureLabel}>FAT %</Text>
            <Text style={styles.measureValue}>{fat.toFixed(1)}%</Text>
            <Text style={styles.measureUnit}>ANALYZER</Text>
          </View>

          <View style={styles.measureWell}>
            <Text style={styles.measureLabel}>SNF %</Text>
            <Text style={styles.measureValue}>{snf.toFixed(1)}%</Text>
            <Text style={styles.measureUnit}>ANALYZER</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Pricing Matrix Breakdown */}
        <View style={styles.reviewRow}>
          <Text style={styles.label}>Applied Unit Rate:</Text>
          <Text style={[styles.value, { color: colors.accentAmber }]}>
            INR {rateCalculation.appliedRate.toFixed(2)} / KG
          </Text>
        </View>

        <View style={styles.reviewRow}>
          <Text style={styles.label}>Pricing Rule:</Text>
          <Text style={[styles.value, { fontSize: 12, fontWeight: 'normal', color: colors.textSecondary }]}>
            {rateCalculation.calculationRule}
          </Text>
        </View>

        <View style={{ height: 16 }} />

        {/* Highlighted Total Amount Card */}
        <View style={styles.totalAmountWell}>
          <View style={styles.totalHeaderRow}>
            <Text style={styles.totalLabel}>TOTAL AMOUNT PAYABLE</Text>
            <View style={styles.bankerRoundingPill}>
              <Text style={styles.bankerRoundingText}>HALF-EVEN ROUNDED</Text>
            </View>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.currencySymbol}>INR</Text>
            <Text style={styles.totalValue}>
              {rateCalculation.totalAmount.toFixed(2)}
            </Text>
          </View>

          <Text style={styles.authoritativeNote}>
            Authoritative rate calculation computed via center rate matrix. Idempotent ledger entry will be recorded.
          </Text>
        </View>

        <View style={{ height: 24 }} />

        {/* Session Action Buttons */}
        <View style={styles.buttonsRow}>
          <ClayButton
            title="CANCEL SESSION"
            onPress={onCancelSession}
            disabled={isLoading}
            variant="outline"
            style={{ flex: 1 }}
            size="lg"
          />
          <ClayButton
            title="COMMIT &amp; PRINT &rarr;"
            onPress={onConfirmCommit}
            isLoading={isLoading}
            variant="primary"
            style={{ flex: 1 }}
            size="lg"
          />
        </View>
      </ClayCard>
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
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    padding: 24,
  },
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  farmerCodeTag: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.accentAmber,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  mobileText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 14,
  },
  measurementRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  measureWell: {
    flex: 1,
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
  measureLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  measureValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  measureUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.clayGreenLight,
    marginTop: 2,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  value: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  totalAmountWell: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(76, 175, 80, 0.4)',
    padding: 16,
  },
  totalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.clayGreenLight,
    letterSpacing: 0.5,
  },
  bankerRoundingPill: {
    backgroundColor: 'rgba(76, 175, 80, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bankerRoundingText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.statusValid,
  },
  totalValue: {
    fontSize: 38,
    fontWeight: '900',
    color: colors.statusValid,
    letterSpacing: -0.5,
  },
  authoritativeNote: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 15,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 16,
  },
});
