/**
 * DFarm Registration App - RFID Assignment & Management Screen
 * Complete parity with Kotlin RfidAssignmentScreen.kt & RfidAssignmentViewModel.kt
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { rfidAdapter } from '../hardware/RfidReaderAdapter';
import { customerApi } from '../api/customerApi';
import { rfidApi } from '../api/rfidApi';
import { CustomerDto, RfidAssignmentDto } from '../types/models';
import { useAuth } from '../auth/AuthContext';

export const RfidAssignmentScreen: React.FC = () => {
  const navigation = useNavigation();
  const { officer } = useAuth();

  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);
  const [rawUidInput, setRawUidInput] = useState('');
  const [normalizedUid, setNormalizedUid] = useState('');
  const [isValidUid, setIsValidUid] = useState(false);
  const [activeAssignment, setActiveAssignment] = useState<RfidAssignmentDto | null>(null);
  const [assignmentHistory, setAssignmentHistory] = useState<RfidAssignmentDto[]>([]);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replacementReason, setReplacementReason] = useState('DAMAGED');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Dialog states
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [dialogReason, setDialogReason] = useState('');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  const isCustomerFaceEnrolled = (c: CustomerDto) =>
    c.status !== 'PENDING_FACE_ENROLLMENT' && c.status !== 'DRAFT';

  const loadCustomers = useCallback(async () => {
    try {
      const res = await customerApi.listCustomers({ page: 1, limit: 100 });
      setCustomers(res.items);
      if (res.items.length > 0 && !selectedCustomer) {
        setSelectedCustomer(res.items[0]);
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to fetch customer list');
    }
  }, [selectedCustomer]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const refreshCustomerAssignments = useCallback(async (customerId: string) => {
    try {
      const status = await rfidApi.getRfidStatus(customerId);
      const active: RfidAssignmentDto | null =
        status.hasActiveCard && status.activeCard
          ? {
              id: status.activeCard.cardId || 'active',
              cardUid: status.activeCard.cardUid,
              assignedAt: status.activeCard.assignedAt || 'N/A',
              assignedBy: 'System Officer',
              isActive: true,
            }
          : null;
      setActiveAssignment(active);

      const history: RfidAssignmentDto[] = (status.assignmentHistory || []).map((h) => ({
        id: h.id || h.cardId || h.cardUid,
        cardUid: h.cardUid,
        isActive: h.isActive,
        assignedAt: h.assignedAt || '',
        assignedBy: h.assignedBy || 'Officer',
        revokedAt: h.revokedAt,
        revocationReason: h.revocationReason,
      }));

      setAssignmentHistory(
        history.sort(
          (a, b) => new Date(b.assignedAt || 0).getTime() - new Date(a.assignedAt || 0).getTime()
        )
      );
    } catch {
      // In offline or fresh assignment scenarios, fallback to local state
      setActiveAssignment(null);
      setAssignmentHistory([]);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      refreshCustomerAssignments(selectedCustomer.id);
    }
  }, [selectedCustomer, refreshCustomerAssignments]);

  const handleSelectCustomer = (customer: CustomerDto) => {
    setSelectedCustomer(customer);
    setRawUidInput('');
    setNormalizedUid('');
    setIsValidUid(false);
    setIsReplacing(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowCustomerPicker(false);
  };

  const onUidInputChanged = (input: string) => {
    const normalized = rfidAdapter.normalizeUid(input);
    const valid = rfidAdapter.isValidHexUid(normalized);
    setRawUidInput(input);
    setNormalizedUid(normalized);
    setIsValidUid(valid);
    setErrorMessage(null);
  };

  const handleAssignCard = async () => {
    if (!selectedCustomer) return;
    if (!isValidUid) {
      setErrorMessage('Enter a valid hexadecimal RFID UID');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const assignment = await rfidApi.assignRfid(selectedCustomer.id, normalizedUid);
      setRawUidInput('');
      setNormalizedUid('');
      setIsValidUid(false);
      setSuccessMessage(`Card ${assignment.cardUid} successfully assigned! Registration status updated.`);
      await refreshCustomerAssignments(selectedCustomer.id);
      await loadCustomers();
    } catch (e: any) {
      setErrorMessage(e?.message || 'Assignment failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReplacement = async () => {
    if (!selectedCustomer) return;
    if (!isValidUid) {
      setErrorMessage('Enter a valid hexadecimal RFID UID');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const assignment = await rfidApi.replaceRfid(selectedCustomer.id, normalizedUid, replacementReason);
      setIsReplacing(false);
      setRawUidInput('');
      setNormalizedUid('');
      setIsValidUid(false);
      setSuccessMessage(`Replacement card ${assignment.cardUid} successfully assigned!`);
      await refreshCustomerAssignments(selectedCustomer.id);
      await loadCustomers();
    } catch (e: any) {
      setErrorMessage(e?.message || 'Replacement failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!activeAssignment) return;
    setIsLoading(true);
    try {
      await rfidApi.revokeRfid(activeAssignment.id || activeAssignment.cardUid || '', dialogReason.trim() || 'MANUAL_REVOCATION');
      setShowRevokeDialog(false);
      setDialogReason('');
      setSuccessMessage('Card successfully revoked.');
      if (selectedCustomer) {
        await refreshCustomerAssignments(selectedCustomer.id);
        await loadCustomers();
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to revoke card');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!activeAssignment) return;
    setIsLoading(true);
    try {
      await rfidApi.blockRfid(activeAssignment.id || activeAssignment.cardUid || '', dialogReason.trim() || 'SECURITY_BLOCK');
      setShowBlockDialog(false);
      setDialogReason('');
      setSuccessMessage('Card successfully blocked.');
      if (selectedCustomer) {
        await refreshCustomerAssignments(selectedCustomer.id);
        await loadCustomers();
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to block card');
    } finally {
      setIsLoading(false);
    }
  };

  const reasons = ['DAMAGED', 'LOST', 'STOLEN', 'DEFECTIVE'];

  return (
    <View style={styles.container}>
      {/* Top App Bar */}
      <View style={styles.topAppBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.onPrimaryContainer} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>RFID Assignment & Management</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 1. Hardware Boundary Banner */}
        <View style={styles.boundaryCard}>
          <View style={styles.boundaryRow}>
            <Ionicons name="information-circle" size={22} color="#F57F17" />
            <View style={styles.boundaryContent}>
              <Text style={styles.boundaryTitle}>
                HARDWARE BOUNDARY: {rfidAdapter.sourceLabel}
              </Text>
              <Text style={styles.boundarySubtitle}>
                Physical reader hardware integration is deferred. Enter hexadecimal UID manually for testing and registration.
              </Text>
            </View>
          </View>
        </View>

        {/* 2. Feedback Banners */}
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning" size={20} color={colors.error} />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
            <TouchableOpacity onPress={() => setErrorMessage(null)}>
              <Text style={styles.errorDismiss}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {successMessage ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={20} color="#2E7D32" />
            <Text style={styles.successBannerText}>{successMessage}</Text>
            <TouchableOpacity onPress={() => setSuccessMessage(null)}>
              <Text style={styles.successDismiss}>OK</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* 3. Customer Selection Section */}
        <View style={styles.section}>
          <Text style={styles.fieldLabel}>Customer</Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            onPress={() => setShowCustomerPicker(true)}
          >
            <Text style={styles.dropdownValue}>
              {selectedCustomer
                ? `${selectedCustomer.farmerCode} - ${selectedCustomer.fullName}`
                : 'Select Customer'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>

        {/* 4. Selected Customer Details & Canonical UUID */}
        {selectedCustomer && (
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Customer Profile</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Canonical UUID:</Text>
              <Text style={[styles.detailValue, styles.monoText]}>{selectedCustomer.id}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Farmer Code:</Text>
              <Text style={[styles.detailValue, styles.boldText]}>{selectedCustomer.farmerCode}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Customer Name:</Text>
              <Text style={styles.detailValue}>{selectedCustomer.fullName}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Account Status:</Text>
              <Text
                style={[
                  styles.detailValue,
                  styles.boldText,
                  { color: selectedCustomer.status === 'ACTIVE' ? '#2E7D32' : '#E65100' },
                ]}
              >
                {selectedCustomer.status}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Biometric Face Status:</Text>
              <Text
                style={[
                  styles.detailValue,
                  styles.boldText,
                  { color: isCustomerFaceEnrolled(selectedCustomer) ? '#2E7D32' : '#C62828' },
                ]}
              >
                {isCustomerFaceEnrolled(selectedCustomer) ? 'ENROLLED' : 'PENDING'}
              </Text>
            </View>
          </View>
        )}

        {/* 5. Active Card Status or Assignment Form */}
        {selectedCustomer && (
          <>
            {activeAssignment && !isReplacing ? (
              <View style={styles.activeCard}>
                <View style={styles.activeCardHeaderRow}>
                  <Ionicons name="card" size={22} color="#1565C0" />
                  <Text style={styles.activeCardTitle}>Active RFID Card</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Card UID:</Text>
                  <Text style={[styles.detailValue, styles.monoText, styles.boldText]}>
                    {activeAssignment.cardUid}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Assigned At:</Text>
                  <Text style={styles.detailValue}>{activeAssignment.assignedAt}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Assigned By:</Text>
                  <Text style={styles.detailValue}>{activeAssignment.assignedBy}</Text>
                </View>

                <View style={styles.activeCardActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.primaryBtn]}
                    onPress={() => {
                      setIsReplacing(true);
                      setRawUidInput('');
                      setNormalizedUid('');
                      setIsValidUid(false);
                    }}
                  >
                    <Text style={styles.primaryBtnText}>Replace Card</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.outlinedBtn]}
                    onPress={() => {
                      setDialogReason('');
                      setShowRevokeDialog(true);
                    }}
                  >
                    <Text style={[styles.outlinedBtnText, { color: colors.error }]}>Revoke</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.outlinedBtn]}
                    onPress={() => {
                      setDialogReason('');
                      setShowBlockDialog(true);
                    }}
                  >
                    <Text style={[styles.outlinedBtnText, { color: colors.error }]}>Block</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.formCard}>
                <Text style={styles.formCardTitle}>
                  {isReplacing ? 'Replace Active RFID Card' : 'Assign New RFID Card'}
                </Text>

                {isReplacing && (
                  <View style={styles.replacementReasonSection}>
                    <Text style={styles.subLabel}>Select Replacement Reason:</Text>
                    <View style={styles.radioGroup}>
                      {reasons.map((reason) => (
                        <TouchableOpacity
                          key={reason}
                          style={styles.radioRow}
                          onPress={() => setReplacementReason(reason)}
                        >
                          <Ionicons
                            name={
                              replacementReason === reason
                                ? 'radio-button-on'
                                : 'radio-button-off'
                            }
                            size={18}
                            color={colors.primary}
                          />
                          <Text style={styles.radioLabel}>{reason}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.inputContainer}>
                  <Text style={styles.inputTitle}>
                    SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={rawUidInput}
                    onChangeText={onUidInputChanged}
                    placeholder="e.g. 04:A1:B2:C3:D4 or 04A1B2C3D4"
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  {normalizedUid.length > 0 && (
                    <Text
                      style={[
                        styles.supportingText,
                        { color: isValidUid ? '#2E7D32' : colors.error },
                      ]}
                    >
                      Normalized UID: {normalizedUid} ({isValidUid ? 'Valid Hex' : 'Invalid'})
                    </Text>
                  )}
                </View>

                {isReplacing ? (
                  <View style={styles.replacementActions}>
                    <TouchableOpacity
                      style={[
                        styles.submitBtn,
                        (!isValidUid || isLoading) && styles.disabledBtn,
                      ]}
                      disabled={!isValidUid || isLoading}
                      onPress={handleConfirmReplacement}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.submitBtnText}>Confirm Replacement</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelOutlinedBtn}
                      onPress={() => setIsReplacing(false)}
                    >
                      <Text style={styles.cancelOutlinedText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      (!isValidUid || isLoading || activeAssignment != null) &&
                        styles.disabledBtn,
                    ]}
                    disabled={
                      !isValidUid || isLoading || activeAssignment != null
                    }
                    onPress={handleAssignCard}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <View style={styles.btnContentRow}>
                        <Ionicons name="card" size={18} color="#FFFFFF" />
                        <Text style={styles.submitBtnText}>Assign RFID Card</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* 6. Assignment History */}
            <View style={styles.historySection}>
              <Text style={styles.historyHeader}>
                Assignment History ({assignmentHistory.length})
              </Text>
              {assignmentHistory.length === 0 ? (
                <Text style={styles.emptyHistoryText}>
                  No prior RFID card history recorded for this customer.
                </Text>
              ) : (
                assignmentHistory.map((item, idx) => (
                  <View
                    key={item.id || idx}
                    style={[
                      styles.historyCard,
                      { backgroundColor: item.isActive ? '#E8F5E9' : '#F5F5F5' },
                    ]}
                  >
                    <View style={styles.historyCardRow}>
                      <Text style={[styles.monoText, styles.boldText]}>{item.cardUid}</Text>
                      <Text
                        style={[
                          styles.historyStatusText,
                          { color: item.isActive ? '#2E7D32' : '#757575' },
                        ]}
                      >
                        {item.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                      </Text>
                    </View>
                    <Text style={styles.historyMetaText}>
                      Assigned: {item.assignedAt} by {item.assignedBy}
                    </Text>
                    {item.revokedAt ? (
                      <Text style={[styles.historyMetaText, { color: colors.error }]}>
                        Revoked: {item.revokedAt} - Reason: {item.revocationReason || 'None'}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Customer Picker Modal */}
      <Modal visible={showCustomerPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <Text style={styles.dialogTitle}>Select Customer</Text>
            <ScrollView style={{ maxHeight: 350 }}>
              {customers.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.pickerItem}
                  onPress={() => handleSelectCustomer(c)}
                >
                  <Text style={styles.pickerItemName}>
                    {c.farmerCode} - {c.fullName}
                  </Text>
                  <Text style={styles.pickerItemSub}>
                    Status: {c.status} | Face: {isCustomerFaceEnrolled(c) ? 'Enrolled' : 'Pending'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.dialogCancelBtn}
              onPress={() => setShowCustomerPicker(false)}
            >
              <Text style={styles.dialogCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Revoke Dialog */}
      <Modal visible={showRevokeDialog} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <Text style={styles.dialogTitle}>Revoke RFID Card</Text>
            <Text style={styles.dialogMessage}>
              Are you sure you want to revoke active card {activeAssignment?.cardUid}?
            </Text>
            <TextInput
              style={styles.dialogInput}
              value={dialogReason}
              onChangeText={setDialogReason}
              placeholder="e.g. Farmer requested deactivation"
            />
            <View style={styles.dialogBtnRow}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setShowRevokeDialog(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogConfirmBtn, { backgroundColor: colors.error }]}
                onPress={handleRevoke}
              >
                <Text style={styles.dialogConfirmText}>Revoke</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Block Dialog */}
      <Modal visible={showBlockDialog} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <Text style={styles.dialogTitle}>Block RFID Card</Text>
            <Text style={styles.dialogMessage}>
              Card {activeAssignment?.cardUid} will be placed into BLOCKED status.
            </Text>
            <TextInput
              style={styles.dialogInput}
              value={dialogReason}
              onChangeText={setDialogReason}
              placeholder="e.g. Suspected fraudulent presentation"
            />
            <View style={styles.dialogBtnRow}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setShowBlockDialog(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogConfirmBtn, { backgroundColor: colors.error }]}
                onPress={handleBlock}
              >
                <Text style={styles.dialogConfirmText}>Block Card</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topAppBar: {
    height: 56,
    backgroundColor: colors.primaryContainer,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.onPrimaryContainer,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  boundaryCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
    padding: 12,
  },
  boundaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  boundaryContent: {
    marginLeft: 10,
    flex: 1,
  },
  boundaryTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#B78103',
  },
  boundarySubtitle: {
    fontSize: 11,
    color: '#5D4037',
    marginTop: 2,
    lineHeight: 16,
  },
  errorBanner: {
    backgroundColor: colors.errorContainer,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    color: colors.onErrorContainer,
    fontSize: 13,
  },
  errorDismiss: {
    color: colors.error,
    fontWeight: 'bold',
    fontSize: 13,
  },
  successBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  successBannerText: {
    flex: 1,
    color: '#1B5E20',
    fontSize: 13,
  },
  successDismiss: {
    color: '#2E7D32',
    fontWeight: 'bold',
    fontSize: 13,
  },
  section: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  dropdownTrigger: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownValue: {
    fontSize: 14,
    color: colors.onSurface,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.onSurface,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: colors.outline,
  },
  detailValue: {
    fontSize: 12,
    color: colors.onSurface,
  },
  monoText: {
    fontFamily: 'monospace',
  },
  boldText: {
    fontWeight: 'bold',
  },
  activeCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  activeCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  activeCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0D47A1',
  },
  activeCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: '#1565C0',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  outlinedBtn: {
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: 'transparent',
  },
  outlinedBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  formCard: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  formCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.onSurfaceVariant,
  },
  replacementReasonSection: {
    gap: 6,
  },
  subLabel: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  radioGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  radioLabel: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  inputContainer: {
    gap: 4,
  },
  inputTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.primary,
  },
  textInput: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    fontSize: 14,
  },
  supportingText: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  submitBtn: {
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  disabledBtn: {
    backgroundColor: colors.outline,
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 6,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replacementActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelOutlinedBtn: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.outline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelOutlinedText: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
  historySection: {
    gap: 8,
    marginTop: 8,
  },
  historyHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.onSurface,
  },
  emptyHistoryText: {
    fontSize: 13,
    color: colors.outline,
  },
  historyCard: {
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  historyCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyStatusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  historyMetaText: {
    fontSize: 11,
    color: colors.outline,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalDialog: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.onSurface,
  },
  dialogMessage: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  dialogInput: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    fontSize: 13,
  },
  dialogBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  dialogCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  dialogCancelText: {
    color: colors.outline,
    fontSize: 13,
  },
  dialogConfirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  dialogConfirmText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  pickerItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  pickerItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.onSurface,
  },
  pickerItemSub: {
    fontSize: 11,
    color: colors.outline,
    marginTop: 2,
  },
});
