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
  AnimalSelector,
  AnimalType,
} from '../../design-system';
import { DairyCenterIcon } from '../../assets/vectors/LocationAssets';

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    dairyId?: string;
    dairyName?: string;
    village?: string;
    mobileNumber?: string;
  }>();

  const dairyId = params.dairyId || '';
  const dairyName = params.dairyName || 'DFarm Cooperative Society';
  const mobileNumber = params.mobileNumber || '';

  const [fullName, setFullName] = useState('');
  const [village, setVillage] = useState(params.village || '');
  const [milkType, setMilkType] = useState<AnimalType>('COW');
  const [consentChecked, setConsentChecked] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (fullName.trim().length < 3) {
      newErrors.fullName = 'Full name must be at least 3 characters';
    }
    if (village.trim().length < 2) {
      newErrors.village = 'Please enter your village or gram panchayat name';
    }
    if (!consentChecked) {
      newErrors.consent = 'Biometric consent is mandatory to proceed with contactless collection';
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
        fullName: fullName.trim(),
        village: village.trim(),
        milkSupplyType: milkType,
        mobileNumber,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Producer Registration"
        subtitle="नोंदणी: वैयक्तिक व दुग्ध तपशील"
        onBack={() => router.back()}
      />

      {/* Step Progress Tracker */}
      <View style={styles.progressContainer}>
        <View style={styles.stepTrack}>
          <View style={styles.stepActiveBar} />
        </View>
        <View style={styles.stepLabelsRow}>
          <Text style={styles.stepActiveLabel}>1. Personal & Animals</Text>
          <Text style={styles.stepInactiveLabel}>2. Live Face Biometrics</Text>
        </View>
      </View>

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
          {/* Selected Dairy Affiliation Certificate */}
          <ClayCard variant="highlight" style={styles.dairyAffiliationCard}>
            <View style={styles.dairyHeaderRow}>
              <View style={styles.dairyBadgeWrapper}>
                <DairyCenterIcon size={28} />
                <ClayBadge label="Affiliated Dairy Center" variant="orange" />
              </View>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.changeDairyText}>Change</Text>
              </Pressable>
            </View>
            <Text style={styles.affiliatedDairyName}>{dairyName}</Text>
            {params.village && (
              <Text style={styles.affiliatedVillage}>
                📍 Center Location: {params.village}
              </Text>
            )}
          </ClayCard>

          {/* Registration Details Form Card */}
          <ClayCard variant="raised" style={styles.formCard}>
            <ClayInput
              label="Full Name (as per Bank / Aadhaar) / पूर्ण नाव"
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
              label="Village / Gram Panchayat / गाव किंवा ग्रामपंचायत"
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

            {/* Milk Supply Animals Segmented Selector */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>Milk Supply Animals / दूध देणारे जनावर</Text>
              <AnimalSelector value={milkType} onChange={setMilkType} />
            </View>

            {/* Biometric Consent Box */}
            <Pressable
              onPress={() => {
                setConsentChecked(!consentChecked);
                if (errors.consent) {
                  setErrors((prev) => ({ ...prev, consent: '' }));
                }
              }}
              style={({ pressed }) => [
                styles.consentCard,
                consentChecked && styles.consentCardActive,
                !!errors.consent && styles.consentCardError,
                pressed && styles.pressed,
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
              <View style={styles.consentTextCol}>
                <Text style={styles.consentTitle}>
                  Biometric Data Privacy Consent / बायोमेट्रिक संमती
                </Text>
                <Text style={styles.consentText}>
                  I grant explicit consent to DFarm and my affiliated dairy society to enroll and
                  store my facial biometric vector using OpenCV YuNet + SFace INT8 for contactless milk
                  pour authentication and automatic ledger crediting.
                </Text>
              </View>
            </Pressable>
            {errors.consent && (
              <Text style={styles.consentErrorText}>⚠️ {errors.consent}</Text>
            )}

            <ClayButton
              title="Next: Live Face Biometric"
              onPress={handleNext}
              variant="primary"
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
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  stepTrack: {
    height: 4,
    backgroundColor: DFARM_COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  stepActiveBar: {
    width: '50%',
    height: '100%',
    backgroundColor: DFARM_COLORS.primaryOrange,
  },
  stepLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepActiveLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryOrange,
  },
  stepInactiveLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 28,
  },
  dairyAffiliationCard: {
    marginBottom: 16,
    padding: 16,
  },
  dairyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dairyBadgeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  affiliatedVillage: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginTop: 2,
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
    marginBottom: 6,
  },
  consentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: DFARM_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    padding: 14,
    marginTop: 8,
    marginBottom: 6,
    gap: 12,
  },
  consentCardActive: {
    borderColor: DFARM_COLORS.primaryOrange,
    backgroundColor: '#FFF9F5',
  },
  consentCardError: {
    borderColor: DFARM_COLORS.error,
    backgroundColor: '#FFF8F8',
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
    marginTop: 2,
  },
  checkboxActive: {
    borderColor: DFARM_COLORS.primaryOrange,
    backgroundColor: DFARM_COLORS.primaryOrange,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  consentTextCol: {
    flex: 1,
  },
  consentTitle: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
    marginBottom: 4,
  },
  consentText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    lineHeight: 18,
  },
  consentErrorText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.error,
    fontWeight: '500',
    marginBottom: 12,
    marginLeft: 4,
  },
  nextBtn: {
    marginTop: 16,
  },
  pressed: {
    opacity: 0.85,
  },
});
