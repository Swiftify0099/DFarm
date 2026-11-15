import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Customer, IdentificationMethod } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ClayCard } from '../components/clay/ClayCard';
import { ClayButton } from '../components/clay/ClayButton';
import { ClayCustomerCard } from '../components/clay/ClayCustomerCard';

interface CustomerInfoScreenProps {
  customer: Customer;
  method: IdentificationMethod;
  onProceed: () => void;
  onReject: () => void;
}

export const CustomerInfoScreen: React.FC<CustomerInfoScreenProps> = ({
  customer,
  method,
  onProceed,
  onReject,
}) => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[typography.headlineMedium, { textAlign: 'center' }]}>
        VERIFIED CUSTOMER DETAILS
      </Text>
      <Text style={[typography.bodyMedium, { textAlign: 'center', marginTop: 4, marginBottom: 20 }]}>
        Confirm farmer identity before recording weights &amp; quality measurements
      </Text>

      <View style={styles.cardWrapper}>
        {/* Clay Customer Card with Verified Identity */}
        <ClayCustomerCard customer={customer} method={method} />

        <View style={{ height: 16 }} />

        {/* Verification Check & Next Steps Card */}
        <ClayCard variant="subtle" style={styles.guidanceCard}>
          <Text style={styles.guidanceTitle}>OPERATIONAL CHECKLIST:</Text>
          <Text style={styles.guidanceItem}>
            ✓ Verified Farmer Code: <Text style={styles.guidanceHighlight}>{customer.farmerCode}</Text>
          </Text>
          <Text style={styles.guidanceItem}>
            ✓ Authorized Milk Categories: <Text style={styles.guidanceHighlight}>{customer.permittedCategories.join(', ')}</Text>
          </Text>
          <Text style={styles.guidanceItem}>
            ✓ Subledger Account Active &bull; Ready for intake weight recording
          </Text>
        </ClayCard>

        <View style={{ height: 24 }} />

        {/* Action Buttons Row */}
        <View style={styles.buttonsRow}>
          <ClayButton
            title="NOT THIS FARMER"
            onPress={onReject}
            variant="outline"
            style={{ flex: 1 }}
            size="lg"
          />
          <ClayButton
            title="PROCEED &rarr;"
            onPress={onProceed}
            variant="primary"
            style={{ flex: 1 }}
            size="lg"
          />
        </View>
      </View>
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
  cardWrapper: {
    width: '100%',
    maxWidth: 540,
  },
  guidanceCard: {
    padding: 16,
    gap: 6,
  },
  guidanceTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  guidanceItem: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  guidanceHighlight: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 16,
  },
});
