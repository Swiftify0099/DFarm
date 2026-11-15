import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Customer, MilkCategory } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ClayCard } from '../components/clay/ClayCard';
import { ClayButton } from '../components/clay/ClayButton';
import { ClayCategoryBadge } from '../components/clay/ClayCategoryBadge';

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
        Choose from the categories authorized for {customer.fullName} ({customer.farmerCode})
      </Text>

      <View style={styles.cardsRow}>
        {/* Cow Milk Card */}
        <ClayCard
          variant={cowPermitted ? 'elevated' : 'subtle'}
          style={[styles.categoryCard, !cowPermitted ? styles.disabledCard : undefined]}
          onPress={cowPermitted ? () => onCategoryChosen('COW') : undefined}
          activeOpacity={cowPermitted ? 0.85 : 1}
        >
          <View style={styles.cardInner}>
            <View style={[styles.iconCircle, { backgroundColor: colors.categoryCowBg }]}>
              <Text style={styles.animalIcon}>🐄</Text>
            </View>

            <View style={{ height: 12 }} />
            <Text
              style={[
                typography.headlineMedium,
                { color: cowPermitted ? colors.textPrimary : colors.textSecondary },
              ]}
            >
              COW MILK
            </Text>

            <View style={{ height: 8 }} />
            {cowPermitted ? (
              <ClayCategoryBadge category="COW" size="sm" />
            ) : (
              <View style={styles.notAuthPill}>
                <Text style={styles.notAuthorizedText}>NOT AUTHORIZED</Text>
              </View>
            )}
          </View>
        </ClayCard>

        {/* Buffalo Milk Card */}
        <ClayCard
          variant={bufPermitted ? 'elevated' : 'subtle'}
          style={[styles.categoryCard, !bufPermitted ? styles.disabledCard : undefined]}
          onPress={bufPermitted ? () => onCategoryChosen('BUFFALO') : undefined}
          activeOpacity={bufPermitted ? 0.85 : 1}
        >
          <View style={styles.cardInner}>
            <View style={[styles.iconCircle, { backgroundColor: colors.categoryBuffaloBg }]}>
              <Text style={styles.animalIcon}>🐃</Text>
            </View>

            <View style={{ height: 12 }} />
            <Text
              style={[
                typography.headlineMedium,
                { color: bufPermitted ? colors.textPrimary : colors.textSecondary },
              ]}
            >
              BUFFALO MILK
            </Text>

            <View style={{ height: 8 }} />
            {bufPermitted ? (
              <ClayCategoryBadge category="BUFFALO" size="sm" />
            ) : (
              <View style={styles.notAuthPill}>
                <Text style={styles.notAuthorizedText}>NOT AUTHORIZED</Text>
              </View>
            )}
          </View>
        </ClayCard>
      </View>

      <View style={{ height: 28 }} />
      <View style={styles.buttonWrapper}>
        <ClayButton
          title="CANCEL TO DASHBOARD"
          onPress={onCancel}
          variant="outline"
          size="lg"
        />
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
  cardsRow: {
    flexDirection: 'row',
    gap: 20,
    width: '100%',
    maxWidth: 560,
    flexWrap: 'wrap',
  },
  categoryCard: {
    flex: 1,
    minWidth: 250,
    minHeight: 200,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledCard: {
    opacity: 0.5,
  },
  cardInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  animalIcon: {
    fontSize: 32,
  },
  notAuthPill: {
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    borderColor: colors.statusError,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  notAuthorizedText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.statusError,
    letterSpacing: 0.5,
  },
  buttonWrapper: {
    width: '100%',
    maxWidth: 560,
  },
});
