import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { CollectionRepository } from '../domain/repository/CollectionRepository';
import { Customer, MilkCategory, RateCalculationResult } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ClayCard } from '../components/clay/ClayCard';
import { ClayInput } from '../components/clay/ClayInput';
import { ClayButton } from '../components/clay/ClayButton';
import { ClayAlert } from '../components/clay/ClayAlert';
import { ClayCategoryBadge } from '../components/clay/ClayCategoryBadge';
import { ClayDeviceBadge } from '../components/clay/ClayDeviceBadge';

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

  // Dynamic range check for live operator guidance
  const parsedWeight = parseFloat(weightText);
  const parsedFat = parseFloat(fatText);
  const parsedSnf = parseFloat(snfText);

  const isWeightValid = !isNaN(parsedWeight) && parsedWeight > 0 && parsedWeight <= 500.0;
  const isFatValid = !isNaN(parsedFat) && parsedFat >= minFat && parsedFat <= maxFat;
  const isSnfValid = !isNaN(parsedSnf) && parsedSnf >= minSnf && parsedSnf <= maxSnf;

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
      {/* Screen Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={typography.headlineMedium}>
            RECORD MEASUREMENTS
          </Text>
          <Text style={[typography.bodyMedium, { marginTop: 2 }]}>
            Farmer: <Text style={styles.customerHighlight}>{customer.fullName}</Text> ({customer.farmerCode})
          </Text>
        </View>

        <ClayCategoryBadge category={category} size="lg" />
      </View>

      <View style={{ height: 16 }} />

      {/* Hardware Connection Ribbon */}
      <View style={styles.hardwareBar}>
        <ClayDeviceBadge
          deviceType="SCALE"
          state="MANUAL_ENTRY"
          customLabel="SCALE: MANUAL (USB OTG DISCONNECTED)"
        />
        <ClayDeviceBadge
          deviceType="ANALYZER"
          state="MANUAL_ENTRY"
          customLabel="ANALYZER: MANUAL ENTRY"
        />
      </View>

      <View style={{ height: 16 }} />

      {/* Biological Bounds Banner Card */}
      <ClayCard variant="subtle" style={styles.boundsCard}>
        <View style={styles.boundsHeader}>
          <Text style={styles.boundsTitle}>
            BIOLOGICAL LIMITS &bull; {category} MILK
          </Text>
          <Text style={styles.canonicalUnitBadge}>CANONICAL UNIT: KG</Text>
        </View>

        <View style={styles.boundsStatsRow}>
          <View style={styles.boundItem}>
            <Text style={styles.boundLabel}>Fat Range</Text>
            <Text style={[styles.boundValue, !isFatValid && styles.boundValueInvalid]}>
              {minFat}% - {maxFat}%
            </Text>
          </View>
          <View style={styles.boundDivider} />
          <View style={styles.boundItem}>
            <Text style={styles.boundLabel}>SNF Range</Text>
            <Text style={[styles.boundValue, !isSnfValid && styles.boundValueInvalid]}>
              {minSnf}% - {maxSnf}%
            </Text>
          </View>
          <View style={styles.boundDivider} />
          <View style={styles.boundItem}>
            <Text style={styles.boundLabel}>Max Single Intake</Text>
            <Text style={styles.boundValue}>500.00 KG</Text>
          </View>
        </View>
      </ClayCard>

      <View style={{ height: 16 }} />

      {validationError && (
        <ClayAlert
          type="error"
          title="Measurement Error"
          message={validationError}
          onDismiss={() => setValidationError(null)}
          style={{ maxWidth: 540 }}
        />
      )}

      {/* Measurement Input Card */}
      <ClayCard variant="elevated" style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={typography.titleLarge}>Intake Readings</Text>
          <Text style={styles.liveReadout}>
            {isWeightValid ? `${parsedWeight.toFixed(2)} KG` : '-- KG'}
          </Text>
        </View>

        <View style={{ height: 16 }} />

        {/* Net Weight Field */}
        <ClayInput
          label="Net Weight (KG)"
          value={weightText}
          onChangeText={(t) => {
            setWeightText(t);
            setValidationError(null);
          }}
          placeholder="0.00"
          keyboardType="decimal-pad"
          unitLabel="KG"
          helperText="Canonical net weight = Gross minus Tare container"
        />

        <View style={{ height: 10 }} />

        {/* Fat Percentage Field */}
        <ClayInput
          label="Fat Percentage (%)"
          value={fatText}
          onChangeText={(t) => {
            setFatText(t);
            setValidationError(null);
          }}
          placeholder="0.0"
          keyboardType="decimal-pad"
          unitLabel="FAT %"
          helperText={`Approved bounds for ${category}: ${minFat}% - ${maxFat}%`}
        />

        <View style={{ height: 10 }} />

        {/* SNF Percentage Field */}
        <ClayInput
          label="SNF Percentage (%)"
          value={snfText}
          onChangeText={(t) => {
            setSnfText(t);
            setValidationError(null);
          }}
          placeholder="0.0"
          keyboardType="decimal-pad"
          unitLabel="SNF %"
          helperText={`Approved bounds for ${category}: ${minSnf}% - ${maxSnf}%`}
        />

        <View style={{ height: 24 }} />

        {/* Action Buttons Row */}
        <View style={styles.buttonsRow}>
          <ClayButton
            title="CANCEL"
            onPress={onCancel}
            variant="outline"
            style={{ flex: 1 }}
            size="lg"
          />
          <ClayButton
            title="VALIDATE & REVIEW &rarr;"
            onPress={handleValidateAndReview}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    maxWidth: 540,
    flexWrap: 'wrap',
    gap: 12,
  },
  customerHighlight: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  hardwareBar: {
    width: '100%',
    maxWidth: 540,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  boundsCard: {
    width: '100%',
    maxWidth: 540,
    padding: 14,
  },
  boundsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  boundsTitle: {
    color: colors.accentAmber,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  canonicalUnitBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.clayGreenLight,
    letterSpacing: 0.5,
  },
  boundsStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  boundItem: {
    alignItems: 'center',
  },
  boundDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  boundLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  boundValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  boundValueInvalid: {
    color: colors.statusError,
  },
  card: {
    width: '100%',
    maxWidth: 540,
    padding: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveReadout: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.clayGreenLight,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 16,
  },
});
