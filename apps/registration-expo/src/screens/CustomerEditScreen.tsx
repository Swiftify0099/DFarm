import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { customerApi } from '../api/customerApi';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';
import { FormInput } from '../components/FormInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { ErrorView } from '../components/ErrorView';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerEdit'>;

export const CustomerEditScreen: React.FC<Props> = ({ route, navigation }) => {
  const { customerId } = route.params;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Read-only keys
  const [mobileNumber, setMobileNumber] = useState('');
  const [farmerCode, setFarmerCode] = useState('');

  // Editable fields
  const [fullName, setFullName] = useState('');
  const [village, setVillage] = useState('');
  const [district, setDistrict] = useState('');
  const [taluka, setTaluka] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfscCode, setBankIfscCode] = useState('');
  const [bankAccountHolderName, setBankAccountHolderName] = useState('');

  const loadCustomer = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const customer = await customerApi.getCustomer(customerId);
      setMobileNumber(customer.normalizedMobileNumber);
      setFarmerCode(customer.farmerCode || '');
      setFullName(customer.fullName);
      setVillage(customer.address?.village || '');
      setDistrict(customer.address?.district || '');
      setTaluka(customer.address?.talukaSubdistrict || '');
      setPostalCode(customer.address?.postalCode || '');
      setBankName(customer.bankName || '');
      setBankAccountNumber(customer.bankAccountNumber || '');
      setBankIfscCode(customer.bankIfscCode || '');
      setBankAccountHolderName(customer.bankAccountHolderName || '');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load customer profile for editing');
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  const handleSave = async () => {
    if (fullName.trim().length < 2) {
      setErrorMessage('Full name must be at least 2 characters');
      return;
    }
    if (!village.trim()) {
      setErrorMessage('Village cannot be empty');
      return;
    }
    if (!district.trim()) {
      setErrorMessage('District cannot be empty');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await customerApi.updateCustomer(customerId, {
        fullName: fullName.trim(),
        address: {
          village: village.trim(),
          district: district.trim(),
          talukaSubdistrict: taluka.trim() || null,
          postalCode: postalCode.trim() || null,
          state: 'Maharashtra',
        },
        bankName: bankName.trim() || null,
        bankAccountNumber: bankAccountNumber.trim() || null,
        bankIfscCode: bankIfscCode.trim() || null,
        bankAccountHolderName: bankAccountHolderName.trim() || null,
      });

      navigation.goBack();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update customer');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingIndicator message="Loading customer for editing..." />;
  }

  if (errorMessage && !fullName) {
    return <ErrorView message={errorMessage} onRetry={loadCustomer} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 3D Clay Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.8}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Edit Farmer Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Protected Immutable Identifiers Card */}
        <View style={styles.protectedCard}>
          <View style={styles.protectedHeaderRow}>
            <View style={styles.lockIconPill}>
              <Text style={styles.lockIcon}>🔒</Text>
            </View>
            <View style={styles.protectedTitleWrap}>
              <Text style={styles.protectedTitle}>
                Immutable Identity Keys
              </Text>
              <Text style={styles.protectedSubtitle}>
                Bound to authoritative PostgreSQL KYC ledger
              </Text>
            </View>
          </View>
          <View style={styles.protectedKeysRow}>
            <View style={styles.keyTag}>
              <Text style={styles.keyTagLabel}>Mobile (E.164):</Text>
              <Text style={styles.keyTagValue}>{mobileNumber}</Text>
            </View>
            <View style={styles.keyTag}>
              <Text style={styles.keyTagLabel}>Farmer Code:</Text>
              <Text style={styles.keyTagValue}>{farmerCode || 'Pending'}</Text>
            </View>
          </View>
        </View>

        {/* Error Banner */}
        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Section 1: Personal Details */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Farmer Personal Details</Text>
          <FormInput
            value={fullName}
            onValueChange={(val) => {
              setFullName(val);
              setErrorMessage(null);
            }}
            label="Farmer Full Name *"
            leadingIcon="👤"
          />
        </View>

        {/* Section 2: Address & Location */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Address & Geographical Location</Text>
          <FormInput
            value={village}
            onValueChange={(val) => {
              setVillage(val);
              setErrorMessage(null);
            }}
            label="Village *"
            leadingIcon="📍"
          />

          <FormInput
            value={taluka}
            onValueChange={setTaluka}
            label="Taluka / Subdistrict"
          />

          <FormInput
            value={district}
            onValueChange={(val) => {
              setDistrict(val);
              setErrorMessage(null);
            }}
            label="District *"
          />

          <FormInput
            value={postalCode}
            onValueChange={(val) => setPostalCode(val.replace(/[^0-9]/g, '').slice(0, 6))}
            label="Postal PIN Code"
            keyboardType="number-pad"
          />
        </View>

        {/* Section 3: Bank Information */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Banking & Payout Credentials</Text>
          <FormInput
            value={bankName}
            onValueChange={setBankName}
            label="Bank Name"
            leadingIcon="🏦"
          />

          <FormInput
            value={bankAccountNumber}
            onValueChange={(val) => setBankAccountNumber(val.replace(/[^0-9]/g, ''))}
            label="Account Number"
            keyboardType="number-pad"
          />

          <FormInput
            value={bankIfscCode}
            onValueChange={(val) => setBankIfscCode(val.toUpperCase().slice(0, 11))}
            label="IFSC Code"
          />

          <FormInput
            value={bankAccountHolderName}
            onValueChange={setBankAccountHolderName}
            label="Account Holder Name"
            returnKeyType="done"
          />
        </View>

        <View style={styles.buttonSpacer} />

        <PrimaryButton
          text="Save Profile Changes"
          onClick={handleSave}
          isLoading={isSaving}
          leadingIcon="💾"
        />
      </ScrollView>
    </SafeAreaView>
  );
};

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
  topBarTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: clayColors.primary,
  },
  placeholder: {
    width: 38,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  protectedCard: {
    backgroundColor: '#E8F2FA',
    borderRadius: clayRadius.card,
    padding: 16,
    gap: 10,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#C8DEEE',
    borderBottomColor: '#B8D2E4',
  },
  protectedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockIconPill: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  lockIcon: {
    fontSize: 14,
  },
  protectedTitleWrap: {
    flex: 1,
  },
  protectedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: clayColors.primary,
  },
  protectedSubtitle: {
    fontSize: 11,
    color: clayColors.textMuted,
    marginTop: 1,
  },
  protectedKeysRow: {
    flexDirection: 'row',
    gap: 8,
  },
  keyTag: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: clayRadius.sm,
  },
  keyTagLabel: {
    fontSize: 10,
    color: clayColors.textMuted,
    fontWeight: '600',
  },
  keyTagValue: {
    fontSize: 13,
    fontWeight: '700',
    color: clayColors.textPrimary,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: clayColors.errorSurface,
    borderRadius: clayRadius.card,
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: clayColors.errorBorder,
    borderBottomColor: clayColors.errorBorder,
  },
  warningIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  errorText: {
    fontSize: 13,
    color: clayColors.error,
    flex: 1,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 18,
    gap: 8,
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
  sectionHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: clayColors.textPrimary,
    marginBottom: 6,
  },
  buttonSpacer: {
    height: 8,
  },
});
