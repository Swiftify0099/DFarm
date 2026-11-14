import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { customerApi } from '../api/customerApi';
import { CustomerDto } from '../types/models';
import { colors } from '../theme/colors';
import { StatusBadge } from '../components/StatusBadge';
import { MilkCategoryBadge } from '../components/MilkCategoryBadge';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { ErrorView } from '../components/ErrorView';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { PrimaryButton } from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerDetail'>;

export const CustomerDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { customerId } = route.params;

  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Dialogs
  const [showDeactivateDialog, setShowDeactivateDialog] = useState<boolean>(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState<boolean>(false);
  const [actionReason, setActionReason] = useState<string>('');

  const loadCustomer = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await customerApi.getCustomer(customerId);
      setCustomer(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load customer details');
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  const handleDeactivate = async () => {
    if (actionReason.trim().length < 5) return;
    setIsLoading(true);
    try {
      const updated = await customerApi.deleteCustomer(customerId, actionReason.trim());
      setCustomer(updated);
      setShowDeactivateDialog(false);
      setActionReason('');
      setActionSuccessMessage('Customer successfully deactivated.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to deactivate customer');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (actionReason.trim().length < 5) return;
    setIsLoading(true);
    try {
      const updated = await customerApi.restoreCustomer(customerId, actionReason.trim());
      setCustomer(updated);
      setShowRestoreDialog(false);
      setActionReason('');
      setActionSuccessMessage('Customer successfully restored.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to restore customer');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !customer) {
    return <LoadingIndicator message="Loading customer profile..." />;
  }

  if (errorMessage && !customer) {
    return <ErrorView message={errorMessage} onRetry={loadCustomer} />;
  }

  if (!customer) {
    return null;
  }

  const isSoftDeleted =
    customer.status === 'SOFT_DELETED' || customer.status === 'INACTIVE';

  const maskedAccount = customer.bankAccountNumber
    ? `•••• •••• ${customer.bankAccountNumber.slice(-4)}`
    : '—';

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

        <Text style={styles.topBarTitle}>Farmer Profile</Text>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => navigation.navigate('CustomerEdit', { customerId })}
        >
          <Text style={styles.editIcon}>✏️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.fullName}>{customer.fullName}</Text>
              {customer.farmerCode ? (
                <Text style={styles.farmerCode}>
                  Farmer Code: {customer.farmerCode}
                </Text>
              ) : null}
            </View>
            <StatusBadge status={customer.status} />
          </View>

          <View style={styles.divider} />

          <View style={styles.uuidWrap}>
            <Text style={styles.uuidLabel}>Server Canonical Customer UUID:</Text>
            <Text style={styles.uuidValue}>{customer.id}</Text>
          </View>
        </View>

        {/* Contact & Identity Card */}
        <DetailSectionCard title="Contact & Identity" icon="📞">
          <DetailRow label="Mobile (E.164)" value={customer.normalizedMobileNumber} />
          <DetailRow label="Primary Center ID" value={customer.primaryCenterId} />
          <DetailRow label="Registration Status" value={customer.registrationStatus} />
        </DetailSectionCard>

        {/* Geographic Address Card */}
        <DetailSectionCard title="Address & Location" icon="📍">
          <DetailRow label="Village" value={customer.address?.village || '—'} />
          <DetailRow
            label="Taluka"
            value={customer.address?.talukaSubdistrict || '—'}
          />
          <DetailRow label="District" value={customer.address?.district || '—'} />
          <DetailRow
            label="State"
            value={customer.address?.state || 'Maharashtra'}
          />
          <DetailRow
            label="PIN Code"
            value={customer.address?.postalCode || '—'}
          />
        </DetailSectionCard>

        {/* Milk Category Permissions Card */}
        <DetailSectionCard title="Milk Delivery Permissions" icon="🥛">
          <View style={styles.categoryPermissionsRow}>
            <Text style={styles.detailLabel}>Permitted Categories</Text>
            <View style={styles.badgesWrap}>
              {(customer.permittedCategories || []).map((cat) => (
                <MilkCategoryBadge key={cat} category={cat} />
              ))}
            </View>
          </View>
        </DetailSectionCard>

        {/* Financial & Bank Card */}
        {customer.bankAccountNumber || customer.bankName ? (
          <DetailSectionCard title="Banking Information" icon="🏦">
            <DetailRow label="Bank Name" value={customer.bankName || '—'} />
            <DetailRow label="Account Number" value={maskedAccount} />
            <DetailRow label="IFSC Code" value={customer.bankIfscCode || '—'} />
            <DetailRow
              label="Account Holder"
              value={customer.bankAccountHolderName || customer.fullName}
            />
          </DetailSectionCard>
        ) : null}

        {/* KYC Progress Tracker Card */}
        <View style={styles.kycCard}>
          <Text style={styles.kycTitle}>KYC & Hardware Readiness Checklist</Text>
          <KycStepItem
            stepName="Personal Details & Canonical UUID"
            isCompleted={true}
            note="Verified in PostgreSQL ledger"
          />
          <KycStepItem
            stepName="Unique Mobile Validation"
            isCompleted={true}
            note={customer.normalizedMobileNumber}
          />
          <KycStepItem
            stepName="Facial Biometric Enrollment"
            isCompleted={customer.status !== 'DRAFT' && customer.status !== 'PENDING_FACE_ENROLLMENT'}
            note="Scheduled for Phase 07"
          />
          <KycStepItem
            stepName="Physical RFID Card Assignment"
            isCompleted={customer.status === 'ACTIVE'}
            note="Scheduled for Phase 08"
          />
        </View>

        {/* Action Success Message */}
        {actionSuccessMessage ? (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerIcon}>✓</Text>
            <Text style={styles.successBannerText}>{actionSuccessMessage}</Text>
          </View>
        ) : null}

        {/* Edit Button */}
        <PrimaryButton
          text="Edit Farmer Details"
          onClick={() => navigation.navigate('CustomerEdit', { customerId })}
          leadingIcon="✏️"
        />

        {/* Soft-Delete or Restore Button */}
        {isSoftDeleted ? (
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={() => {
              setActionReason('');
              setShowRestoreDialog(true);
            }}
          >
            <Text style={styles.restoreIcon}>🔄</Text>
            <Text style={styles.restoreButtonText}>Restore Customer Profile</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.deactivateButton}
            onPress={() => {
              setActionReason('');
              setShowDeactivateDialog(true);
            }}
          >
            <Text style={styles.deactivateIcon}>🗑️</Text>
            <Text style={styles.deactivateButtonText}>
              Deactivate Customer (Soft-Delete)
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Deactivate Dialog */}
      <ConfirmationDialog
        visible={showDeactivateDialog}
        title="Deactivate Customer"
        message="This customer will be soft-deleted. Historical milk collections, ledger, and payouts are permanently preserved in the PostgreSQL ledger."
        confirmText="Deactivate"
        confirmColor={colors.error}
        onConfirm={handleDeactivate}
        onDismiss={() => setShowDeactivateDialog(false)}
      >
        <TextInput
          style={styles.dialogInput}
          value={actionReason}
          onChangeText={setActionReason}
          placeholder="Reason (min 5 characters)"
          placeholderTextColor={colors.outline}
        />
      </ConfirmationDialog>

      {/* Restore Dialog */}
      <ConfirmationDialog
        visible={showRestoreDialog}
        title="Restore Customer"
        message="This customer will be restored back to ACTIVE status."
        confirmText="Restore"
        confirmColor="#137333"
        onConfirm={handleRestore}
        onDismiss={() => setShowRestoreDialog(false)}
      >
        <TextInput
          style={styles.dialogInput}
          value={actionReason}
          onChangeText={setActionReason}
          placeholder="Reason (min 5 characters)"
          placeholderTextColor={colors.outline}
        />
      </ConfirmationDialog>
    </SafeAreaView>
  );
};

const DetailSectionCard: React.FC<{
  title: string;
  icon: string;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <View style={styles.sectionCard}>
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionIcon}>{icon}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.divider} />
    <View style={styles.sectionContent}>{children}</View>
  </View>
);

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const KycStepItem: React.FC<{
  stepName: string;
  isCompleted: boolean;
  note: string;
}> = ({ stepName, isCompleted, note }) => (
  <View style={styles.kycRow}>
    <View
      style={[
        styles.kycBadge,
        isCompleted ? styles.kycBadgeCompleted : styles.kycBadgePending,
      ]}
    >
      <Text style={isCompleted ? styles.kycCheck : styles.kycPending}>
        {isCompleted ? '✓' : '⏳'}
      </Text>
    </View>
    <View style={styles.kycTexts}>
      <Text style={styles.kycStepName}>{stepName}</Text>
      <Text style={styles.kycNote}>{note}</Text>
    </View>
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
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  editButton: {
    padding: 6,
  },
  editIcon: {
    fontSize: 18,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: '#ECEFF1',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitleWrap: {
    flex: 1,
    marginRight: 10,
  },
  fullName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurface,
  },
  farmerCode: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#ECEFF1',
    marginVertical: 10,
  },
  uuidWrap: {
    gap: 2,
  },
  uuidLabel: {
    fontSize: 11,
    color: colors.outline,
  },
  uuidValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#ECEFF1',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
  },
  sectionContent: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  detailLabel: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.onSurface,
  },
  categoryPermissionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgesWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  kycCard: {
    backgroundColor: 'rgba(219, 228, 235, 0.4)',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  kycTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 4,
  },
  kycRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kycBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  kycBadgeCompleted: {
    backgroundColor: '#E6F4EA',
  },
  kycBadgePending: {
    backgroundColor: '#FEF7E0',
  },
  kycCheck: {
    color: '#137333',
    fontWeight: 'bold',
    fontSize: 13,
  },
  kycPending: {
    color: '#B06000',
    fontSize: 11,
  },
  kycTexts: {
    flex: 1,
  },
  kycStepName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
  },
  kycNote: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4EA',
    borderRadius: 10,
    padding: 12,
  },
  successBannerIcon: {
    fontSize: 16,
    color: '#137333',
    fontWeight: 'bold',
    marginRight: 8,
  },
  successBannerText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#137333',
  },
  restoreButton: {
    flexDirection: 'row',
    height: 50,
    backgroundColor: '#137333',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  restoreButtonText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  deactivateButton: {
    flexDirection: 'row',
    height: 50,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deactivateIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  deactivateButtonText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '600',
  },
  dialogInput: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    fontSize: 14,
    color: colors.onSurface,
  },
});
