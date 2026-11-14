import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Customer, IdentificationMethod } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';

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
      <View style={{ height: 24 }} />

      <Card style={styles.card} backgroundColor={colors.surfaceDark}>
        <Text style={[typography.titleLarge, { color: colors.accentAmber }]}>
          Farmer Code: {customer.farmerCode}
        </Text>
        <Text style={[typography.headlineMedium, { marginTop: 4 }]}>
          Customer: {customer.fullName}
        </Text>
        {customer.mobileNumber ? (
          <Text style={[typography.bodyMedium, { color: colors.textSecondary, marginTop: 4 }]}>
            Mobile: {customer.mobileNumber}
          </Text>
        ) : null}

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Text style={styles.label}>Auth Method:</Text>
          <Text style={styles.value}>{method}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Account Status:</Text>
          <Text style={[styles.value, { color: colors.statusValid }]}>
            {customer.status}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Authorized Milk:</Text>
          <Text style={[styles.value, { color: colors.primaryLight }]}>
            {customer.permittedCategories.join(', ')}
          </Text>
        </View>

        <View style={{ height: 24 }} />

        <View style={styles.buttonsRow}>
          <Button
            title="NOT THIS FARMER"
            onPress={onReject}
            variant="outline"
            style={{ flex: 1 }}
          />
          <Button
            title="PROCEED"
            onPress={onProceed}
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
  divider: {
    height: 1,
    backgroundColor: colors.cardBackground,
    marginVertical: 16,
  },
  infoRow: {
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
  buttonsRow: {
    flexDirection: 'row',
    gap: 16,
  },
});
