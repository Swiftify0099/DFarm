import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  ClayCard,
  ClayButton,
  ClayInput,
  ClayBadge,
  ClayHeader,
} from '../../design-system';

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    dairyId?: string;
    dairyName?: string;
    village?: string;
    mobileNumber?: string;
  }>();

  const dairyId = params.dairyId || '9a6d80a1-4e78-4ef6-bb4d-6e8284534e10';
  const dairyName = params.dairyName || 'Shree Krishna Sahakari Dudh Sanstha';
  const mobileNumber = params.mobileNumber || '';

  const [fullName, setFullName] = useState('');
  const [village, setVillage] = useState(params.village || '');
  const [milkType, setMilkType] = useState<'COW' | 'BUFFALO' | 'BOTH'>('COW');
  const [consentChecked, setConsentChecked] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (fullName.trim().length < 3) {
      newErrors.fullName = 'Full name must be at least 3 characters';
    }
    if (village.trim().length < 2) {
      newErrors.village = 'Please enter your village name';
    }
    if (!consentChecked) {
      newErrors.consent = 'Biometric consent is mandatory to proceed';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    router.push({
      pathname: '/(onboarding)/face-enroll',
      params: {
        dairyId,
        dairyName,
        fullName,
        village,
        milkSupplyType: milkType,
        mobileNumber,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Producer Registration"
        subtitle="Step 1 of 2: Personal & Dairy Details"
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
        >
          {/* Selected Dairy Affiliation Card */}
          <ClayCard variant="highlight" style={styles.dairyAffiliationCard}>
            <View style={styles.dairyHeaderRow}>
              <ClayBadge label="Selected Dairy" variant="orange" />
              <Pressable onPress={() => router.back()}>
                <Text style={styles.changeDairyText}>Change</Text>
              </Pressable>
            </View>
            <Text style={styles.affiliatedDairyName}>{dairyName}</Text>
          </ClayCard>

          {/* Registration Details Form Card */}
          <ClayCard variant="raised" style={styles.formCard}>
            <ClayInput
              label="Full Name (as per Bank / Aadhaar)"
              placeholder="e.g. Vitthal Dnyandeo Patil"
              value={fullName}
              onChangeText={(text) => {
                setFullName(text);
                if (errors.fullName) {
                  setErrors((prev) => ({ ...prev, fullName: '' }));
                }
              }}
              error={errors.fullName}
            />

            <ClayInput
              label="Village / Gram Panchayat"
              placeholder="e.g. Manchar"
              value={village}
              onChangeText={(text) => {
                setVillage(text);
                if (errors.village) {
                  setErrors((prev) => ({ ...prev, village: '' }));
                }
              }}
              error={errors.village}
            />

            {/* Milk Supply Category Toggle */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>Milk Supply Animals</Text>
              <View style={styles.animalTypeRow}>
                {(['COW', 'BUFFALO', 'BOTH'] as const).map((type) => {
                  const isSelected = milkType === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => setMilkType(type)}
                      style={[
                        styles.animalPill,
                        isSelected && styles.animalPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.animalPillText,
                          isSelected && styles.animalPillTextActive,
                        ]}
                      >
                        {type === 'COW'
                          ? '🐄 Cow'
                          : type === 'BUFFALO'
                          ? '🐃 Buffalo'
                          : '🐄+🐃 Both'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Biometric Consent Box */}
            <Pressable
              onPress={() => setConsentChecked(!consentChecked)}
              style={[
                styles.consentCard,
                consentChecked && styles.consentCardActive,
                !!errors.consent && styles.consentCardError,
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  consentChecked && styles.checkboxActive,
                ]}
              >
                {consentChecked && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.consentText}>
                I provide explicit consent to DFarm to enroll and store my
                facial biometric vector for contactless milk collection
                identity verification.
              </Text>
            </Pressable>
            {errors.consent && (
              <Text style={styles.consentErrorText}>{errors.consent}</Text>
            )}

            <ClayButton
              title="Next: Live Face Biometric"
              onPress={handleNext}
              style={styles.nextBtn}
            />
          </ClayCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  dairyAffiliationCard: {
    marginBottom: 16,
  },
  dairyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  changeDairyText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  affiliatedDairyName: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
  },
  formCard: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  fieldSection: {
    marginBottom: 16,
  },
  fieldLabel: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '600',
    color: DFARM_COLORS.primaryText,
    marginBottom: 8,
  },
  animalTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  animalPill: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 3,
    borderRadius: DFARM_RADIUS.md,
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    alignItems: 'center',
  },
  animalPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: DFARM_COLORS.primaryOrange,
  },
  animalPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: DFARM_COLORS.secondaryText,
  },
  animalPillTextActive: {
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
  },
  consentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: DFARM_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    padding: 12,
    marginBottom: 6,
    marginTop: 4,
  },
  consentCardActive: {
    borderColor: DFARM_COLORS.primaryOrange,
    backgroundColor: '#FFF9F5',
  },
  consentCardError: {
    borderColor: DFARM_COLORS.error,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: DFARM_COLORS.secondaryText,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: DFARM_COLORS.primaryOrange,
    borderColor: DFARM_COLORS.primaryOrange,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  consentText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryText,
    flex: 1,
    lineHeight: 18,
  },
  consentErrorText: {
    fontSize: 12,
    color: DFARM_COLORS.error,
    marginBottom: 12,
    marginLeft: 4,
    fontWeight: '600',
  },
  nextBtn: {
    marginTop: 14,
  },
});
