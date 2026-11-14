import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { CollectionRepository } from '../domain/repository/CollectionRepository';
import { Customer, MilkCategory, RateCalculationResult } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';

interface MeasurementScreenProps {
  customer: Customer;
  category: MilkCategory;
  repository: CollectionRepository;
  onRateCalculated: (
    weightKg: number,
    fat: number,
    snf: number,
    rateResult: RateCalculationResult
  ) => void;
  onCancel: () => void;
}

export const MeasurementScreen: React.FC<MeasurementScreenProps> = ({
  customer,
  category,
  repository,
  onRateCalculated,
  onCancel,
}) => {
  const isCow = category === 'COW';
  const minFat = isCow ? 2.8 : 5.0;
  const maxFat = isCow ? 6.0 : 12.0;
  const minSnf = isCow ? 7.8 : 8.2;
  const maxSnf = isCow ? 10.2 : 11.5;

  const [weightText, setWeightText] = useState('15.5');
  const [fatText, setFatText] = useState(isCow ? '4.2' : '6.5');
  const [snfText, setSnfText] = useState(isCow ? '8.5' : '9.0');
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleValidateAndReview = async () => {
    const w = parseFloat(weightText);
    const f = parseFloat(fatText);
    const s = parseFloat(snfText);

    if (isNaN(w) || w <= 0 || w > 500.0) {
      setValidationError('Net weight must be between 0.01 and 500.00 KG');
      return;
    }
    if (isNaN(f) || f < minFat || f > maxFat) {
      setValidationError(
        `Fat ${isNaN(f) ? fatText : f}% is outside biological bounds [${minFat} - ${maxFat}%]`
      );
      return;
    }
    if (isNaN(s) || s < minSnf || s > maxSnf) {
      setValidationError(
        `SNF ${isNaN(s) ? snfText : s}% is outside biological bounds [${minSnf} - ${maxSnf}%]`
      );
      return;
    }

    setIsLoading(true);
    setValidationError(null);
    try {
      const res = await repository.calculateRate(category, f, s, w);
      setIsLoading(false);
      if (res.success && res.result) {
        onRateCalculated(w, f, s, res.result);
      } else {
        setValidationError(res.error || 'Failed to calculate rate');
      }
    } catch (e: any) {
      setIsLoading(false);
      setValidationError(e.message || 'Rate calculation error');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[typography.headlineMedium, { textAlign: 'center' }]}>
        RECORD MEASUREMENTS: {category} MILK
      </Text>
      <Text style={[typography.bodyMedium, { textAlign: 'center', marginTop: 4, marginBottom: 16 }]}>
        Customer: {customer.fullName} ({customer.farmerCode})
      </Text>

      {/* Biological Bounds Banner */}
      <View style={styles.boundsBanner}>
        <Text style={styles.boundsText}>
          Biological Bounds for {category}: Fat: {minFat} - {maxFat}% | SNF: {minSnf} - {maxSnf}% | Canonical Unit: KG
        </Text>
      </View>

      {validationError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{validationError}</Text>
        </View>
      )}

      {/* Measurement Input Card */}
      <Card style={styles.card} backgroundColor={colors.surfaceDark}>
        <Input
          label="Net Weight (KG)"
          value={weightText}
          onChangeText={(t) => {
            setWeightText(t);
            setValidationError(null);
          }}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        <View style={{ height: 12 }} />

        <Input
          label="Fat Percentage (%)"
          value={fatText}
          onChangeText={(t) => {
            setFatText(t);
            setValidationError(null);
          }}
          placeholder="0.0"
          keyboardType="decimal-pad"
        />

        <View style={{ height: 12 }} />

        <Input
          label="SNF Percentage (%)"
          value={snfText}
          onChangeText={(t) => {
            setSnfText(t);
            setValidationError(null);
          }}
          placeholder="0.0"
          keyboardType="decimal-pad"
        />

        <View style={{ height: 24 }} />

        <View style={styles.buttonsRow}>
          <Button
            title="CANCEL"
            onPress={onCancel}
            variant="outline"
            style={{ flex: 1 }}
          />
          <Button
            title="VALIDATE & REVIEW"
            onPress={handleValidateAndReview}
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
  boundsBanner: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    width: '100%',
    maxWidth: 500,
  },
  boundsText: {
    color: colors.accentAmber,
    fontSize: 12,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    borderColor: colors.statusError,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    width: '100%',
    maxWidth: 500,
    marginBottom: 16,
  },
  errorText: {
    color: colors.statusError,
    fontSize: 13,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 500,
    padding: 24,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 16,
  },
});
