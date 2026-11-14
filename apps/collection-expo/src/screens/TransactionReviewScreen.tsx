import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Customer, MilkCategory, RateCalculationResult } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';

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
        TRANSACTION REVIEW & PRICING
      </Text>
      <Text style={[typography.bodyMedium, { textAlign: 'center', marginTop: 4, marginBottom: 16 }]}>
        Customer: {customer.fullName} ({customer.farmerCode})
      </Text>

      {errorMessage && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <Card style={styles.card} backgroundColor={colors.surfaceDark}>
        <View style={styles.reviewRow}>
          <Text style={styles.label}>Milk Category:</Text>
          <Text style={styles.value}>{category}</Text>
        </View>

        <View style={styles.reviewRow}>
          <Text style={styles.label}>Net Quantity:</Text>
          <Text style={styles.value}>{netWeight.toFixed(2)} KG</Text>
        </View>

        <View style={styles.reviewRow}>
          <Text style={styles.label}>Fat / SNF:</Text>
          <Text style={styles.value}>
            {fat.toFixed(1)}% / {snf.toFixed(1)}%
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.reviewRow}>
          <Text style={styles.label}>Applied Rate:</Text>
          <Text style={[styles.value, { color: colors.accentAmber }]}>
            INR {rateCalculation.appliedRate.toFixed(2)} / KG
          </Text>
        </View>

        <View style={styles.reviewRow}>
          <Text style={styles.label}>Calculation Rule:</Text>
          <Text style={[styles.value, { fontSize: 12, fontWeight: 'normal' }]}>
            {rateCalculation.calculationRule}
          </Text>
        </View>

        <View style={{ height: 12 }} />

        <View style={styles.reviewRow}>
          <Text style={typography.titleLarge}>TOTAL AMOUNT:</Text>
          <Text style={[typography.headlineMedium, { color: colors.statusValid }]}>
            INR {rateCalculation.totalAmount.toFixed(2)}
          </Text>
        </View>

        <View style={{ height: 24 }} />

        <View style={styles.buttonsRow}>
          <Button
            title="CANCEL SESSION"
            onPress={onCancelSession}
            disabled={isLoading}
            variant="outline"
            style={{ flex: 1 }}
          />
          <Button
            title="COMMIT & PRINT"
            onPress={onConfirmCommit}
            isLoading={isLoading}
            variant="primary"
            style={{ flex: 1 }}
          />
        </View>
      </Card>
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
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  card: {
    width: '100%',
    maxWidth: 550,
    padding: 24,
  },
  errorBox: {
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    borderColor: colors.statusError,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    width: '100%',
    maxWidth: 550,
    marginBottom: 16,
  },
  errorText: {
    color: colors.statusError,
    fontSize: 13,
    textAlign: 'center',
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  value: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBackground,
    marginVertical: 12,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 16,
  },
});
