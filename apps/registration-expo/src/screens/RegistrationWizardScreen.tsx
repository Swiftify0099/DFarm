import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useAuth } from '../auth/AuthContext';
import { customerApi } from '../api/customerApi';
import { CustomerDto } from '../types/models';
import { colors } from '../theme/colors';
import { clayColors, clayRadius, clayStyles } from '../theme/claymorphism';
import { clayAssets } from '../theme/assets';
import { FormInput } from '../components/FormInput';
import { PhoneInput } from '../components/PhoneInput';
import {
  MilkCategorySelector,
  MilkCategoryOptionKey,
  MILK_CATEGORY_OPTIONS,
} from '../components/MilkCategorySelector';
import { MilkCategoryBadge } from '../components/MilkCategoryBadge';
import { StatusBadge } from '../components/StatusBadge';
import { PrimaryButton } from '../components/PrimaryButton';
import { DuplicateMobileError } from '../api/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'RegistrationWizard'>;

export enum WizardStep {
  PERSONAL_DETAILS = 1,
  MOBILE_VALIDATION = 2,
  MILK_CATEGORY = 3,
  REVIEW_DETAILS = 4,
  REGISTRATION_STATUS = 5,
}

const STEP_TITLES: Record<WizardStep, string> = {
  [WizardStep.PERSONAL_DETAILS]: 'Personal Details',
  [WizardStep.MOBILE_VALIDATION]: 'Mobile & Identity',
  [WizardStep.MILK_CATEGORY]: 'Milk Permissions',
  [WizardStep.REVIEW_DETAILS]: 'Review & Submit',
  [WizardStep.REGISTRATION_STATUS]: 'Registration Status',
};

export const RegistrationWizardScreen: React.FC<Props> = ({ navigation }) => {
  const { activeCenterId } = useAuth();

  const [currentStep, setCurrentStep] = useState<WizardStep>(WizardStep.PERSONAL_DETAILS);

  // Step 1: Personal Details
  const [fullName, setFullName] = useState('');
  const [village, setVillage] = useState('');
  const [district, setDistrict] = useState('Kolhapur');
  const [taluka, setTaluka] = useState('');
  const [postalCode, setPostalCode] = useState('');

  // Step 2: Mobile Number
  const [mobileDigits, setMobileDigits] = useState('');
  const [normalizedMobile, setNormalizedMobile] = useState('');

  // Step 3: Milk Categories
  const [selectedCategoryOption, setSelectedCategoryOption] =
    useState<MilkCategoryOptionKey>('BOTH');

  // Errors
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [villageError, setVillageError] = useState<string | null>(null);
  const [districtError, setDistrictError] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Processing & Created Result
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdCustomer, setCreatedCustomer] = useState<CustomerDto | null>(null);

  const handleMobileDigitsChange = (digits: string) => {
    setMobileDigits(digits);
    setMobileError(null);
    setGeneralError(null);
    if (digits.length === 10) {
      setNormalizedMobile(`+91${digits}`);
    } else {
      setNormalizedMobile('');
    }
  };

  const handleNextStep = () => {
    setGeneralError(null);

    if (currentStep === WizardStep.PERSONAL_DETAILS) {
      let hasError = false;
      if (fullName.trim().length < 2) {
        setFullNameError("Enter farmer's full name (min 2 characters)");
        hasError = true;
      }
      if (!village.trim()) {
        setVillageError('Village is required');
        hasError = true;
      }
      if (!district.trim()) {
        setDistrictError('District is required');
        hasError = true;
      }
      if (hasError) return;
      setCurrentStep(WizardStep.MOBILE_VALIDATION);
      return;
    }

    if (currentStep === WizardStep.MOBILE_VALIDATION) {
      const digits = mobileDigits.trim();
      if (digits.length !== 10) {
        setMobileError('Mobile number must be exactly 10 digits');
        return;
      }
      if (!/^[6-9]\d{9}$/.test(digits)) {
        setMobileError('Enter a valid Indian mobile number starting with 6-9');
        return;
      }
      setNormalizedMobile(`+91${digits}`);
      setCurrentStep(WizardStep.MILK_CATEGORY);
      return;
    }

    if (currentStep === WizardStep.MILK_CATEGORY) {
      setCurrentStep(WizardStep.REVIEW_DETAILS);
      return;
    }

    if (currentStep === WizardStep.REVIEW_DETAILS) {
      handleSubmitRegistration();
      return;
    }
  };

  const handlePreviousStep = () => {
    setGeneralError(null);
    if (currentStep === WizardStep.MOBILE_VALIDATION) {
      setCurrentStep(WizardStep.PERSONAL_DETAILS);
    } else if (currentStep === WizardStep.MILK_CATEGORY) {
      setCurrentStep(WizardStep.MOBILE_VALIDATION);
    } else if (currentStep === WizardStep.REVIEW_DETAILS) {
      setCurrentStep(WizardStep.MILK_CATEGORY);
    }
  };

  const handleSubmitRegistration = async () => {
    setIsSubmitting(true);
    setGeneralError(null);

    const categories =
      MILK_CATEGORY_OPTIONS.find((opt) => opt.key === selectedCategoryOption)
        ?.categories || ['COW', 'BUFFALO'];

    try {
      const customer = await customerApi.createCustomer({
        fullName: fullName.trim(),
        normalizedMobileNumber: normalizedMobile,
        permittedCategories: categories,
        primaryCenterId: activeCenterId,
        address: {
          village: village.trim(),
          district: district.trim(),
          talukaSubdistrict: taluka.trim() || null,
          postalCode: postalCode.trim() || null,
          state: 'Maharashtra',
        },
      });

      setCreatedCustomer(customer);
      setCurrentStep(WizardStep.REGISTRATION_STATUS);
    } catch (err: any) {
      if (err instanceof DuplicateMobileError || err.code === 'DUPLICATE_MOBILE_NUMBER') {
        setGeneralError(
          `Mobile number ${normalizedMobile} is already registered in this organization. Duplicate registration is rejected.`
        );
      } else {
        setGeneralError(err.message || 'Failed to create customer record on server');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetWizard = () => {
    setCurrentStep(WizardStep.PERSONAL_DETAILS);
    setFullName('');
    setVillage('');
    setDistrict('Kolhapur');
    setTaluka('');
    setPostalCode('');
    setMobileDigits('');
    setNormalizedMobile('');
    setSelectedCategoryOption('BOTH');
    setFullNameError(null);
    setVillageError(null);
    setDistrictError(null);
    setMobileError(null);
    setGeneralError(null);
    setCreatedCustomer(null);
  };

  const selectedCategories =
    MILK_CATEGORY_OPTIONS.find((opt) => opt.key === selectedCategoryOption)
      ?.categories || ['COW', 'BUFFALO'];

  return (
    <SafeAreaView style={styles.container}>
      {/* 3D Clay Top Bar */}
      <View style={styles.topBar}>
        {currentStep !== WizardStep.REGISTRATION_STATUS ? (
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => {
              if (currentStep === WizardStep.PERSONAL_DETAILS) {
                navigation.goBack();
              } else {
                handlePreviousStep();
              }
            }}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backButtonPlaceholder} />
        )}

        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle}>Customer Registration</Text>
          {currentStep !== WizardStep.REGISTRATION_STATUS ? (
            <View style={styles.stepBadgeRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>
                  Step {currentStep} of 4: {STEP_TITLES[currentStep]}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.backButtonPlaceholder} />
      </View>

      {/* 3D Recessed Progress Bar */}
      {currentStep !== WizardStep.REGISTRATION_STATUS ? (
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${(currentStep / 4) * 100}%` },
            ]}
          />
        </View>
      ) : null}

      {/* Scrollable Step Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* General Error Banner */}
        {generalError ? (
          <View style={styles.generalErrorBox}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.generalErrorText}>{generalError}</Text>
          </View>
        ) : null}

        {/* STEP 1: Personal Details */}
        {currentStep === WizardStep.PERSONAL_DETAILS ? (
          <View style={styles.stepContainer}>
            {/* 3D Clay Illustration Card */}
            <View style={styles.illustrationCard}>
              <Image
                source={clayAssets.registrationIllustration}
                style={styles.stepIllustration}
                resizeMode="contain"
              />
              <View style={styles.illustrationTextWrap}>
                <Text style={styles.sectionTitle}>Farmer Personal Profile</Text>
                <Text style={styles.sectionSubtitle}>
                  Enter legal farmer identity details for canonical dairy records.
                </Text>
              </View>
            </View>

            {/* Clay Form Card */}
            <View style={styles.formCard}>
              <FormInput
                value={fullName}
                onValueChange={(val) => {
                  setFullName(val);
                  setFullNameError(null);
                }}
                label="Farmer Full Name *"
                placeholder="e.g. Pandurang Tukaram Patil"
                leadingIcon="👤"
                isError={!!fullNameError}
                errorMessage={fullNameError}
              />

              <FormInput
                value={village}
                onValueChange={(val) => {
                  setVillage(val);
                  setVillageError(null);
                }}
                label="Village *"
                placeholder="e.g. Wadgaon"
                leadingIcon="📍"
                isError={!!villageError}
                errorMessage={villageError}
              />

              <FormInput
                value={taluka}
                onValueChange={setTaluka}
                label="Taluka / Subdistrict"
                placeholder="e.g. Karveer"
              />

              <FormInput
                value={district}
                onValueChange={(val) => {
                  setDistrict(val);
                  setDistrictError(null);
                }}
                label="District *"
                placeholder="e.g. Kolhapur"
                isError={!!districtError}
                errorMessage={districtError}
              />

              <FormInput
                value={postalCode}
                onValueChange={(val) => setPostalCode(val.replace(/[^0-9]/g, '').slice(0, 6))}
                label="Postal PIN Code"
                placeholder="e.g. 416001"
                keyboardType="number-pad"
              />
            </View>
          </View>
        ) : null}

        {/* STEP 2: Mobile Validation */}
        {currentStep === WizardStep.MOBILE_VALIDATION ? (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeaderCard}>
              <View style={styles.stepIconWrap}>
                <Text style={styles.stepHeaderEmoji}>📱</Text>
              </View>
              <View style={styles.stepHeaderText}>
                <Text style={styles.sectionTitle}>Primary Mobile & Identity</Text>
                <Text style={styles.sectionSubtitle}>
                  The mobile number serves as the primary unique communication key. It
                  must be unique within the dairy organization.
                </Text>
              </View>
            </View>

            <View style={styles.formCard}>
              <PhoneInput
                rawDigits={mobileDigits}
                onValueChange={handleMobileDigitsChange}
                isError={!!mobileError}
                errorMessage={mobileError}
              />

              {normalizedMobile ? (
                <View style={styles.normalizedCard}>
                  <View style={styles.greenCheckPill}>
                    <Text style={styles.greenCheckIcon}>✓</Text>
                  </View>
                  <View style={styles.normalizedTextWrap}>
                    <Text style={styles.normalizedLabel}>Canonical E.164 Format</Text>
                    <Text style={styles.normalizedNumber}>{normalizedMobile}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* STEP 3: Milk Category */}
        {currentStep === WizardStep.MILK_CATEGORY ? (
          <View style={styles.stepContainer}>
            <MilkCategorySelector
              selectedOption={selectedCategoryOption}
              onOptionSelected={setSelectedCategoryOption}
            />
          </View>
        ) : null}

        {/* STEP 4: Review Details */}
        {currentStep === WizardStep.REVIEW_DETAILS ? (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeaderCard}>
              <View style={styles.stepIconWrap}>
                <Text style={styles.stepHeaderEmoji}>📋</Text>
              </View>
              <View style={styles.stepHeaderText}>
                <Text style={styles.sectionTitle}>Review Registration Details</Text>
                <Text style={styles.sectionSubtitle}>
                  Verify all KYC details carefully before committing to the canonical dairy ledger.
                </Text>
              </View>
            </View>

            <View style={styles.reviewCard}>
              <ReviewRow label="Full Name" value={fullName} />
              <ReviewRow label="Normalized Mobile" value={normalizedMobile} />
              <ReviewRow label="Village" value={village} />
              <ReviewRow label="Taluka" value={taluka || '—'} />
              <ReviewRow label="District" value={district} />
              <ReviewRow label="PIN Code" value={postalCode || '—'} />

              <View style={styles.divider} />

              <View style={styles.reviewCategoriesRow}>
                <Text style={styles.reviewLabel}>Permitted Milk</Text>
                <View style={styles.categoryBadgesWrap}>
                  {selectedCategories.map((cat) => (
                    <MilkCategoryBadge key={cat} category={cat} />
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.declarationCard}>
              <Text style={styles.declarationIcon}>🛡️</Text>
              <Text style={styles.declarationText}>
                I confirm that physical KYC documentation and farmer biometric consent
                have been verified in compliance with DFarm Dairy Policy.
              </Text>
            </View>
          </View>
        ) : null}

        {/* STEP 5: Registration Status */}
        {currentStep === WizardStep.REGISTRATION_STATUS && createdCustomer ? (
          <View style={styles.successContainer}>
            {/* 3D Success Medallion Illustration */}
            <Image
              source={clayAssets.registrationSuccess}
              style={styles.successIllustration}
              resizeMode="contain"
            />

            <Text style={styles.successTitle}>Registration Created!</Text>
            <Text style={styles.successSubtitle}>
              Customer record created in authoritative PostgreSQL database.
            </Text>

            <View style={styles.summaryCard}>
              <ReviewRow label="Customer Name" value={createdCustomer.fullName} />
              <ReviewRow
                label="Mobile Number"
                value={createdCustomer.normalizedMobileNumber}
              />
              <ReviewRow
                label="Farmer Code"
                value={createdCustomer.farmerCode || 'Pending Assignment'}
              />

              <View style={styles.divider} />

              <View style={styles.uuidSection}>
                <Text style={styles.uuidLabel}>Server Canonical Customer UUID</Text>
                <Text style={styles.uuidValue}>{createdCustomer.id}</Text>
              </View>

              <View style={styles.reviewCategoriesRow}>
                <Text style={styles.reviewLabel}>Current Status</Text>
                <StatusBadge status={createdCustomer.status} />
              </View>

              <View style={styles.reviewCategoriesRow}>
                <Text style={styles.reviewLabel}>Permitted Categories</Text>
                <View style={styles.categoryBadgesWrap}>
                  {(createdCustomer.permittedCategories || []).map((cat) => (
                    <MilkCategoryBadge key={cat} category={cat} />
                  ))}
                </View>
              </View>
            </View>

            {/* Lifecycle Next Steps Card */}
            <View style={styles.nextStepsCard}>
              <Text style={styles.nextStepsTitle}>
                Required Lifecycle Next Steps:
              </Text>
              <View style={styles.stepItemRow}>
                <Text style={styles.stepDot}>👉</Text>
                <Text style={styles.stepItemText}>
                  Step 2: Biometric Face Enrollment (MobileFaceNet-ArcFace v1.0.0)
                </Text>
              </View>
              <View style={styles.stepItemRow}>
                <Text style={styles.stepDot}>👉</Text>
                <Text style={styles.stepItemText}>
                  Step 3: RFID Assignment (Software Manual Entry / Physical Deferred)
                </Text>
              </View>
            </View>

            <PrimaryButton
              text="Proceed to Biometric Face Enrollment"
              onClick={() => {
                navigation.navigate('FaceEnrollment', {
                  customerId: createdCustomer.id,
                  customerName: createdCustomer.fullName,
                  farmerCode: createdCustomer.farmerCode || '',
                });
              }}
              leadingIcon="👤"
            />

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.outlineNavButton}
              onPress={() => navigation.navigate('CustomerList')}
            >
              <Text style={styles.outlineNavButtonText}>View in Customer List</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.outlineNavButton}
              onPress={handleResetWizard}
            >
              <Text style={styles.outlineNavButtonText}>
                Register Another Customer
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom Sticky Action Bar */}
      {currentStep !== WizardStep.REGISTRATION_STATUS ? (
        <View style={styles.bottomBar}>
          {currentStep !== WizardStep.PERSONAL_DETAILS ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.previousButton}
              onPress={handlePreviousStep}
            >
              <Text style={styles.previousButtonText}>← Previous</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.nextButtonWrap}>
            <PrimaryButton
              text={
                currentStep === WizardStep.REVIEW_DETAILS
                  ? 'Submit Registration'
                  : 'Continue →'
              }
              onClick={handleNextStep}
              isLoading={isSubmitting}
            />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const ReviewRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.reviewRow}>
    <Text style={styles.reviewLabel}>{label}</Text>
    <Text style={styles.reviewValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: clayColors.canvasBackground,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#DFE7ED',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EDF4F8',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#CDDCE6',
    borderBottomColor: '#BDCED8',
  },
  backIcon: {
    fontSize: 20,
    color: clayColors.primary,
    fontWeight: 'bold',
  },
  backButtonPlaceholder: {
    width: 38,
  },
  topBarCenter: {
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: clayColors.primary,
  },
  stepBadgeRow: {
    marginTop: 4,
  },
  stepBadge: {
    backgroundColor: '#E5F3FA',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: clayRadius.pill,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: clayColors.primary,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#D9E8F2',
    width: '100%',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: clayColors.primary,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 110,
  },
  generalErrorBox: {
    flexDirection: 'row',
    backgroundColor: clayColors.errorSurface,
    borderRadius: clayRadius.card,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: clayColors.errorBorder,
    borderBottomColor: clayColors.errorBorder,
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  generalErrorText: {
    fontSize: 13,
    color: clayColors.error,
    flex: 1,
    lineHeight: 18,
    fontWeight: '600',
  },
  stepContainer: {
    gap: 14,
  },
  illustrationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  stepIllustration: {
    width: 80,
    height: 80,
    marginRight: 14,
  },
  illustrationTextWrap: {
    flex: 1,
  },
  stepHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  stepIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EDF4F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepHeaderEmoji: {
    fontSize: 22,
  },
  stepHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: clayColors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: clayColors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 18,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  normalizedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5F3FA',
    borderRadius: clayRadius.md,
    padding: 12,
    marginTop: 10,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#C4DDEB',
    borderBottomColor: '#C4DDEB',
  },
  greenCheckPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: clayColors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  greenCheckIcon: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  normalizedTextWrap: {
    flex: 1,
  },
  normalizedLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: clayColors.primary,
  },
  normalizedNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: clayColors.textPrimary,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 18,
    gap: 12,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewLabel: {
    fontSize: 13,
    color: clayColors.textSecondary,
    fontWeight: '500',
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '700',
    color: clayColors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2ECF3',
    marginVertical: 4,
  },
  reviewCategoriesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBadgesWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  declarationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF5FA',
    borderRadius: clayRadius.md,
    padding: 14,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#D1E1EC',
    borderBottomColor: '#C4D6E2',
  },
  declarationIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  declarationText: {
    fontSize: 12,
    color: clayColors.textSecondary,
    flex: 1,
    lineHeight: 18,
    fontWeight: '500',
  },
  successContainer: {
    alignItems: 'center',
    gap: 16,
  },
  successIllustration: {
    width: 140,
    height: 140,
    marginTop: 8,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: clayColors.primary,
  },
  successSubtitle: {
    fontSize: 13,
    color: clayColors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 18,
    gap: 12,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  uuidSection: {
    backgroundColor: '#EBF4FA',
    padding: 10,
    borderRadius: clayRadius.sm,
    gap: 3,
  },
  uuidLabel: {
    fontSize: 11,
    color: clayColors.textMuted,
    fontWeight: '600',
  },
  uuidValue: {
    fontSize: 12,
    fontWeight: '700',
    color: clayColors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  nextStepsCard: {
    width: '100%',
    backgroundColor: '#E4F2F8',
    borderRadius: clayRadius.card,
    padding: 16,
    gap: 8,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#CCE3F0',
    borderBottomColor: '#BDD9E8',
  },
  nextStepsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: clayColors.primary,
    marginBottom: 2,
  },
  stepItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepDot: {
    fontSize: 14,
    marginRight: 6,
    marginTop: 1,
  },
  stepItemText: {
    fontSize: 12,
    color: clayColors.textPrimary,
    lineHeight: 18,
    flex: 1,
    fontWeight: '500',
  },
  outlineNavButton: {
    width: '100%',
    height: 50,
    borderRadius: clayRadius.lg,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CEDAE2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineNavButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: clayColors.textPrimary,
  },
  bottomBar: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.5,
    borderTopColor: '#DFE7ED',
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  previousButton: {
    flex: 1,
    height: 52,
    borderRadius: clayRadius.lg,
    backgroundColor: '#EDF3F8',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#CDDCE6',
    borderBottomColor: '#BDCED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previousButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: clayColors.textSecondary,
  },
  nextButtonWrap: {
    flex: 1,
  },
});
