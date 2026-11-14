import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { CollectionRepository } from '../domain/repository/CollectionRepository';
import { Customer, IdentificationMethod } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { FilterChip } from '../components/common/FilterChip';
import { Dialog } from '../components/common/Dialog';

interface IdentificationScreenProps {
  repository: CollectionRepository;
  onIdentified: (customer: Customer, method: IdentificationMethod) => void;
  onCancel: () => void;
}

const REASONS = [
  'FACE_RECOGNITION_FAILED',
  'DAMAGED_RFID',
  'LOST_RFID',
  'UNREGISTERED_BIOMETRIC',
  'OTHER',
];

export const IdentificationScreen: React.FC<IdentificationScreenProps> = ({
  repository,
  onIdentified,
  onCancel,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<IdentificationMethod>('RFID');
  const [rfidInput, setRfidInput] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Customer | null>(null);
  const [showSupervisorDialog, setShowSupervisorDialog] = useState(false);
  const [supervisorReason, setSupervisorReason] = useState('FACE_RECOGNITION_FAILED');
  const [supervisorNotes, setSupervisorNotes] = useState(
    'Face recognition uncalibrated, verified farmer identity manually'
  );
  const [supervisorPin, setSupervisorPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVerifyRfid = async () => {
    if (!rfidInput.trim()) {
      setErrorMessage('Please enter or scan an RFID card UID');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await repository.identifyByRfid(rfidInput);
      setIsLoading(false);
      if (result.type === 'SUCCESS') {
        onIdentified(result.customer, 'RFID');
      } else {
        setErrorMessage(`${result.reason} [${result.errorCode}]`);
      }
    } catch (e: any) {
      setIsLoading(false);
      setErrorMessage(e.message || 'RFID verification error');
    }
  };

  const handleSearchCustomers = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await repository.searchCustomers(searchCode);
      setIsLoading(false);
      setSearchResults(list);
      if (list.length === 0) {
        setErrorMessage(`No active customers matching '${searchCode}' found`);
      }
    } catch (e: any) {
      setIsLoading(false);
      setErrorMessage(e.message || 'Search failed');
    }
  };

  const handleConfirmSupervisor = async () => {
    if (!selectedCandidate) return;
    if (supervisorNotes.trim().length < 5) {
      setErrorMessage('Supervisor notes must be at least 5 characters');
      setShowSupervisorDialog(false);
      return;
    }
    setIsLoading(true);
    setShowSupervisorDialog(false);
    try {
      const result = await repository.verifyBySupervisor(
        selectedCandidate.id,
        supervisorReason,
        supervisorNotes,
        supervisorPin.trim() ? supervisorPin.trim() : null
      );
      setIsLoading(false);
      if (result.type === 'SUCCESS') {
        onIdentified(result.customer, 'SUPERVISOR_MANUAL');
      } else {
        setErrorMessage(`${result.reason} [${result.errorCode}]`);
      }
    } catch (e: any) {
      setIsLoading(false);
      setErrorMessage(e.message || 'Supervisor verification failed');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[typography.headlineMedium, { textAlign: 'center' }]}>
        CUSTOMER IDENTIFICATION
      </Text>
      <Text style={[typography.bodyMedium, { textAlign: 'center', marginTop: 4, marginBottom: 20 }]}>
        Approved Methods: 1. Face (Fail-Safe Guard) -&gt; 2. RFID Card -&gt; 3. Supervisor Manual
      </Text>

      {/* Chip Selection Row */}
      <View style={styles.chipRow}>
        <FilterChip
          label="1. FACE RECOGNITION"
          selected={selectedMethod === 'FACE'}
          onPress={() => {
            setSelectedMethod('FACE');
            setErrorMessage(null);
          }}
        />
        <FilterChip
          label="2. RFID CARD TAP"
          selected={selectedMethod === 'RFID'}
          onPress={() => {
            setSelectedMethod('RFID');
            setErrorMessage(null);
          }}
        />
        <FilterChip
          label="3. SUPERVISOR MANUAL"
          selected={selectedMethod === 'SUPERVISOR_MANUAL'}
          onPress={() => {
            setSelectedMethod('SUPERVISOR_MANUAL');
            setErrorMessage(null);
          }}
        />
      </View>

      <View style={{ height: 20 }} />

      {errorMessage && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {/* Main Mode Card */}
      <Card style={styles.mainCard} backgroundColor={colors.surfaceDark}>
        {selectedMethod === 'FACE' && (
          <View>
            <View style={styles.failSafeBox}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={styles.failSafeTitle}>FAIL-SAFE ACTIVE</Text>
              <Text style={styles.failSafeText}>
                Face recognition ONNX model is uncalibrated / unapproved for production.{'\n'}
                Automatic matching is disabled to prevent fake identity matches.
              </Text>
            </View>

            <View style={{ height: 20 }} />
            <View style={styles.failSafeButtonsRow}>
              <Button
                title="USE RFID CARD TAP"
                onPress={() => setSelectedMethod('RFID')}
                variant="primary"
                style={{ flex: 1, height: 48 }}
              />
              <Button
                title="SUPERVISOR MANUAL"
                onPress={() => setSelectedMethod('SUPERVISOR_MANUAL')}
                variant="secondary"
                style={{ flex: 1, height: 48 }}
              />
            </View>
          </View>
        )}

        {selectedMethod === 'RFID' && (
          <View>
            <Text style={typography.bodyLarge}>
              Hold or enter customer RFID card UID:
            </Text>
            <View style={{ height: 16 }} />

            <Input
              label="RFID Card UID (e.g. RFID-COW-1001 or 04A1B2C3)"
              value={rfidInput}
              onChangeText={(t) => {
                setRfidInput(t);
                setErrorMessage(null);
              }}
              placeholder="Scan or enter RFID UID"
            />

            <View style={{ height: 20 }} />

            <Button
              title="VERIFY RFID CARD"
              onPress={handleVerifyRfid}
              isLoading={isLoading}
              variant="primary"
              style={{ height: 48 }}
            />
          </View>
        )}

        {selectedMethod === 'SUPERVISOR_MANUAL' && (
          <View>
            <Text style={typography.bodyLarge}>
              Search Registered Customer by Farmer Code, Name, or Mobile:
            </Text>
            <View style={{ height: 12 }} />

            <View style={styles.searchRow}>
              <Input
                label="Farmer Code, Name, or Mobile"
                value={searchCode}
                onChangeText={(t) => {
                  setSearchCode(t);
                  setErrorMessage(null);
                }}
                placeholder="e.g. FARMER-001 or Patil"
                style={{ flex: 1 }}
              />
              <Button
                title="SEARCH"
                onPress={handleSearchCustomers}
                isLoading={isLoading}
                variant="primary"
                style={styles.searchBtn}
              />
            </View>

            {searchResults.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={typography.titleMedium}>
                  Select Customer for Supervisor Verification:
                </Text>
                <View style={{ height: 8 }} />

                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {searchResults.map((cust) => (
                    <TouchableOpacity
                      key={cust.id}
                      style={styles.candidateRow}
                      onPress={() => {
                        setSelectedCandidate(cust);
                        setShowSupervisorDialog(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <View>
                        <Text style={[typography.bodyLarge, { fontWeight: 'bold' }]}>
                          {cust.fullName}
                        </Text>
                        <Text style={[typography.caption, { marginTop: 2 }]}>
                          Code: {cust.farmerCode} | Permitted: {cust.permittedCategories.join(', ')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 18, color: colors.primaryLight }}>✓</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 16 }} />
        <Button
          title="CANCEL"
          onPress={onCancel}
          variant="outline"
          style={{ width: '100%' }}
        />
      </Card>

      {/* Supervisor Verification Modal Dialog */}
      <Dialog
        visible={showSupervisorDialog && selectedCandidate !== null}
        onDismiss={() => setShowSupervisorDialog(false)}
      >
        {selectedCandidate && (
          <View>
            <Text style={typography.titleLarge}>Supervisor Identity Verification</Text>
            <Text style={[typography.bodyMedium, { color: colors.accentAmber, marginTop: 4 }]}>
              Customer: {selectedCandidate.fullName} ({selectedCandidate.farmerCode})
            </Text>

            <View style={{ height: 16 }} />
            <Text style={styles.reasonLabel}>Reason Category:</Text>
            <View style={styles.reasonsList}>
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.reasonOption,
                    supervisorReason === r && styles.reasonOptionSelected,
                  ]}
                  onPress={() => setSupervisorReason(r)}
                >
                  <Text
                    style={[
                      styles.reasonOptionText,
                      supervisorReason === r && { color: colors.textPrimary, fontWeight: 'bold' },
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ height: 12 }} />
            <Input
              label="Audit Justification Notes (min 5 chars)"
              value={supervisorNotes}
              onChangeText={setSupervisorNotes}
              multiline
              numberOfLines={2}
            />

            <View style={{ height: 12 }} />
            <Input
              label="Supervisor PIN (Optional)"
              value={supervisorPin}
              onChangeText={setSupervisorPin}
              placeholder="PIN"
              secureTextEntry
            />

            <View style={{ height: 20 }} />
            <View style={styles.dialogButtonsRow}>
              <Button
                title="CANCEL"
                onPress={() => setShowSupervisorDialog(false)}
                variant="outline"
                style={{ flex: 1 }}
              />
              <Button
                title="CONFIRM"
                onPress={handleConfirmSupervisor}
                isLoading={isLoading}
                variant="primary"
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </Dialog>
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
  },
  chipRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    borderColor: colors.statusError,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    width: '100%',
    maxWidth: 550,
    marginBottom: 16,
  },
  errorText: {
    color: colors.statusError,
    fontSize: 13,
    textAlign: 'center',
  },
  mainCard: {
    width: '100%',
    maxWidth: 550,
    padding: 24,
  },
  failSafeBox: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.accentAmber,
    padding: 16,
    alignItems: 'center',
  },
  warningIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  failSafeTitle: {
    color: colors.accentAmber,
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 6,
  },
  failSafeText: {
    color: colors.textPrimary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  failSafeButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  searchBtn: {
    height: 50,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  candidateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  reasonLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  reasonsList: {
    gap: 6,
  },
  reasonOption: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reasonOptionSelected: {
    borderColor: colors.primaryLight,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
  },
  reasonOptionText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  dialogButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
});
