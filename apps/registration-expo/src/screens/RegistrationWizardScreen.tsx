import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useAuth } from '../auth/AuthContext';
import { customerApi } from '../api/customerApi';
import { CustomerDto } from '../types/models';
import { colors } from '../theme/colors';
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
      {/* Top Bar */}
      <View style={styles.topBar}>
        {currentStep !== WizardStep.REGISTRATION_STATUS ? (
          <TouchableOpacity
            style={styles.backButton}
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
            <Text style={styles.topBarSubtitle}>
              Step {currentStep} of 4: {STEP_TITLES[currentStep]}
            </Text>
          ) : null}
        </View>

        <View style={styles.backButtonPlaceholder} />
      </View>

      {/* Progress Bar */}
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
            <Text style={styles.sectionTitle}>Farmer Personal Information</Text>
            <Text style={styles.sectionSubtitle}>
              Enter authoritative farmer identity as registered with local center.
            </Text>

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
        ) : null}

        {/* STEP 2: Mobile Validation */}
        {currentStep === WizardStep.MOBILE_VALIDATION ? (
          <View style={styles.stepContainer}>
            <Text style={styles.sectionTitle}>Primary Mobile & Verification</Text>
            <Text style={styles.sectionSubtitle}>
              The mobile number serves as the primary unique communication key. It
              must be unique within the dairy organization.
            </Text>

            <PhoneInput
              rawDigits={mobileDigits}
              onValueChange={handleMobileDigitsChange}
              isError={!!mobileError}
              errorMessage={mobileError}
            />

            {normalizedMobile ? (
              <View style={styles.normalizedCard}>
                <Text style={styles.greenCheckIcon}>✓</Text>
                <View style={styles.normalizedTextWrap}>
                  <Text style={styles.normalizedLabel}>Normalized E.164 Format</Text>
                  <Text style={styles.normalizedNumber}>{normalizedMobile}</Text>
                </View>
              </View>
            ) : null}
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
            <Text style={styles.sectionTitle}>Review Registration Details</Text>
            <Text style={styles.sectionSubtitle}>
              Verify all details carefully before submitting to the canonical dairy ledger.
            </Text>

            <View style={styles.reviewCard}>
              <ReviewRow label="Full Name" value={fullName} />
              <ReviewRow label="Normalized Mobile" value={normalizedMobile} />
              <ReviewRow label="Village" value={village} />
              <ReviewRow label="Taluka" value={taluka || '—'} />
              <ReviewRow label="District" value={district} />
              <ReviewRow label="PIN Code" value={postalCode || '—'} />

              <View style={styles.divider} />

              <View style={styles.reviewCategoriesRow}>
                <Text style={styles.reviewLabel}>Milk Categories</Text>
                <View style={styles.categoryBadgesWrap}>
                  {selectedCategories.map((cat) => (
                    <MilkCategoryBadge key={cat} category={cat} />
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.declarationCard}>
              <Text style={styles.declarationIcon}>📋</Text>
              <Text style={styles.declarationText}>
                I verify that the farmer has provided valid physical KYC
                documentation and consent for dairy registration.
              </Text>
            </View>
          </View>
        ) : null}

        {/* STEP 5: Registration Status */}
        {currentStep === WizardStep.REGISTRATION_STATUS && createdCustomer ? (
          <View style={styles.successContainer}>
            <View style={styles.successCircle}>
              <Text style={styles.successCheck}>✓</Text>
            </View>

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
                <Text style={styles.uuidLabel}>Server Canonical UUID</Text>
                <Text style={styles.uuidValue}>{createdCustomer.id}</Text>
              </View>

              <View style={styles.reviewCategoriesRow}>
                <Text style={styles.reviewLabel}>Current Status</Text>
                <StatusBadge status={createdCustomer.status} />
              </View>

              <View style={styles.reviewCategoriesRow}>
                <Text style={styles.reviewLabel}>Permitted Milk</Text>
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
              <Text style={styles.stepItemText}>
                👉 Step 2: Biometric Face Enrollment (MobileFaceNet-ArcFace v1.0.0)
              </Text>
              <Text style={styles.stepItemText}>
                👉 Step 3: RFID Assignment (Software Manual Entry / Physical Deferred)
              </Text>
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
            />

            <TouchableOpacity
              style={styles.outlineNavButton}
              onPress={() => navigation.navigate('CustomerList')}
            >
              <Text style={styles.outlineNavButtonText}>View in Customer List</Text>
            </TouchableOpacity>

            <TouchableOpacity
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
              style={styles.previousButton}
              onPress={handlePreviousStep}
            >
              <Text style={styles.previousButtonText}>Previous</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.nextButtonWrap}>
            <PrimaryButton
              text={
                currentStep === WizardStep.REVIEW_DETAILS
                  ? 'Submit Registration'
                  : 'Continue'
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
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
  },
  backButton: {
    padding: 6,
  },
  backIcon: {
    fontSize: 22,
    color: colors.primary,
  },
  backButtonPlaceholder: {
    width: 32,
  },
  topBarCenter: {
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.onSurface,
  },
  topBarSubtitle: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: colors.surfaceVariant,
    width: '100%',
  },
  progressBarFill: {
    height: 4,
    backgroundColor: colors.primary,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  generalErrorBox: {
    flexDirection: 'row',
    backgroundColor: colors.errorContainer,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  generalErrorText: {
    fontSize: 13,
    color: colors.onErrorContainer,
    flex: 1,
    lineHeight: 18,
  },
  stepContainer: {
    gap: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurface,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 4,
  },
  normalizedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(35, 117, 155, 0.15)',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  greenCheckIcon: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: 'bold',
    marginRight: 10,
  },
  normalizedTextWrap: {
    flex: 1,
  },
  normalizedLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  normalizedNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
    marginTop: 2,
  },
  reviewCard: {
    backgroundColor: 'rgba(219, 228, 235, 0.4)',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewLabel: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
  },
  divider: {
    height: 1,
    backgroundColor: colors.outlineVariant,
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
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ECEFF1',
  },
  declarationIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  declarationText: {
    fontSize: 12,
    color: colors.onSurface,
    flex: 1,
    lineHeight: 18,
  },
  successContainer: {
    alignItems: 'center',
    gap: 16,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  successCheck: {
    fontSize: 40,
    color: '#137333',
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.onSurface,
  },
  successSubtitle: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  summaryCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  uuidSection: {
    gap: 2,
  },
  uuidLabel: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  uuidValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  nextStepsCard: {
    width: '100%',
    backgroundColor: 'rgba(35, 117, 155, 0.12)',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  nextStepsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  stepItemText: {
    fontSize: 13,
    color: colors.onSurface,
    lineHeight: 18,
  },
  outlineNavButton: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineNavButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
  },
  bottomBar: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
    gap: 12,
  },
  previousButton: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previousButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
  },
  nextButtonWrap: {
    flex: 1,
  },
});
