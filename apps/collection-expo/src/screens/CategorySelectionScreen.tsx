import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Customer, MilkCategory } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';

interface CategorySelectionScreenProps {
  customer: Customer;
  onCategoryChosen: (category: MilkCategory) => void;
  onCancel: () => void;
}

export const CategorySelectionScreen: React.FC<CategorySelectionScreenProps> = ({
  customer,
  onCategoryChosen,
  onCancel,
}) => {
  const cowPermitted = customer.permittedCategories.includes('COW');
  const bufPermitted = customer.permittedCategories.includes('BUFFALO');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[typography.headlineMedium, { textAlign: 'center' }]}>
        SELECT MILK CATEGORY
      </Text>
      <Text style={[typography.bodyMedium, { textAlign: 'center', marginTop: 4, marginBottom: 32 }]}>
        Choose from the categories authorized for {customer.fullName}
      </Text>

      <View style={styles.cardsRow}>
        <Card
          style={styles.categoryCard}
          backgroundColor={cowPermitted ? colors.primaryGreen : 'rgba(44, 44, 44, 0.5)'}
          onPress={cowPermitted ? () => onCategoryChosen('COW') : undefined}
        >
          <View style={styles.cardInner}>
            <Text
              style={[
                typography.headlineMedium,
                { color: cowPermitted ? colors.textPrimary : colors.textSecondary },
              ]}
            >
              COW MILK
            </Text>
            {!cowPermitted && (
              <Text style={styles.notAuthorizedText}>(Not Authorized)</Text>
            )}
          </View>
        </Card>

        <Card
          style={styles.categoryCard}
          backgroundColor={bufPermitted ? colors.surfaceDark : 'rgba(44, 44, 44, 0.5)'}
          onPress={bufPermitted ? () => onCategoryChosen('BUFFALO') : undefined}
        >
          <View style={styles.cardInner}>
            <Text
              style={[
                typography.headlineMedium,
                { color: bufPermitted ? colors.textPrimary : colors.textSecondary },
              ]}
            >
              BUFFALO MILK
            </Text>
            {!bufPermitted && (
              <Text style={styles.notAuthorizedText}>(Not Authorized)</Text>
            )}
          </View>
        </Card>
      </View>

      <View style={{ height: 24 }} />
      <Button
        title="CANCEL"
        onPress={onCancel}
        variant="outline"
        style={styles.cancelBtn}
      />
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
  cardsRow: {
    flexDirection: 'row',
    gap: 24,
    width: '100%',
    maxWidth: 550,
    flexWrap: 'wrap',
  },
  categoryCard: {
    flex: 1,
    minWidth: 240,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  notAuthorizedText: {
    fontSize: 12,
    color: colors.statusError,
    marginTop: 4,
  },
  cancelBtn: {
    width: '100%',
    maxWidth: 550,
  },
});
