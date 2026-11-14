import React, { useState, useEffect, useCallback } from 'react';
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
import { customerApi } from '../api/customerApi';
import { colors } from '../theme/colors';
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
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Edit Farmer Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Protected Immutable Identifiers Card */}
        <View style={styles.protectedCard}>
          <View style={styles.protectedHeaderRow}>
            <Text style={styles.lockIcon}>🔒</Text>
            <Text style={styles.protectedTitle}>
              Protected Identity Keys (Immutable)
            </Text>
          </View>
          <Text style={styles.protectedText}>
            Mobile: {mobileNumber} • Code: {farmerCode || 'Pending'}
          </Text>
        </View>

        {/* Error Banner */}
        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Section: Personal Details */}
        <Text style={styles.sectionHeader}>Personal Details</Text>
        <FormInput
          value={fullName}
          onValueChange={(val) => {
            setFullName(val);
            setErrorMessage(null);
          }}
          label="Farmer Full Name *"
          leadingIcon="👤"
        />

        {/* Section: Address & Location */}
        <Text style={styles.sectionHeader}>Address & Location</Text>
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

        {/* Section: Bank Information */}
        <Text style={styles.sectionHeader}>Bank Information</Text>
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
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  placeholder: {
    width: 32,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  protectedCard: {
    backgroundColor: 'rgba(219, 228, 235, 0.5)',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  protectedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  protectedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.outline,
  },
  protectedText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: colors.errorContainer,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  warningIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  errorText: {
    fontSize: 13,
    color: colors.onErrorContainer,
    flex: 1,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
    marginTop: 6,
  },
  buttonSpacer: {
    height: 8,
  },
});
