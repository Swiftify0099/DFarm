import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { colors } from '../../components/theme/colors';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useAuth } from '../../context/AuthContext';
import { profileApi } from '../../api/profile.api';

export interface EditProfileScreenProps {
  navigation: any;
}

export const EditProfileScreen: React.FC<EditProfileScreenProps> = ({ navigation }) => {
  const { currentCustomer, session } = useAuth();
  const customerId = currentCustomer?.id || session?.customer_id;

  const [selectedLanguage, setSelectedLanguage] = useState<'mr' | 'hi' | 'en'>('mr');
  const [notificationConsent, setNotificationConsent] = useState(true);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!customerId) return;
    setSaving(true);
    try {
      await profileApi.updateProfile(customerId, {
        preferredLanguage: selectedLanguage,
        notificationConsent,
        email: email.trim() || undefined,
      });

      Alert.alert('Preferences Saved', 'Your communication preferences have been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Could not update preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Verification Warning Card */}
        <Card variant="flat" style={styles.warningCard}>
          <Text style={styles.warningTitle}>🛡️ Security & Identity Integrity</Text>
          <Text style={styles.warningDesc}>
            To protect financial transactions and dairy milk credits, changes to Farmer Name, Mobile Number, Bank Account Details, or Center Association must be verified in person by your Dairy Center Supervisor.
          </Text>
        </Card>

        {/* Preferred Language Selection */}
        <Card variant="elevated" style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Preferred Language</Text>
          <Text style={styles.sectionSubtitle}>
            Select the language for receipts, SMS, and interface text:
          </Text>

          <View style={styles.langList}>
            {[
              { code: 'mr', name: 'मराठी (Marathi)', note: 'स्थानिक भाषा' },
              { code: 'hi', name: 'हिन्दी (Hindi)', note: 'राष्ट्रभाषा' },
              { code: 'en', name: 'English', note: 'Standard' },
            ].map(lang => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langItem,
                  selectedLanguage === lang.code && styles.langItemActive,
                ]}
                onPress={() => setSelectedLanguage(lang.code as any)}
              >
                <View>
                  <Text
                    style={[
                      styles.langName,
                      selectedLanguage === lang.code && styles.langNameActive,
                    ]}
                  >
                    {lang.name}
                  </Text>
                  <Text style={styles.langNote}>{lang.note}</Text>
                </View>
                <View
                  style={[
                    styles.radioCircle,
                    selectedLanguage === lang.code && styles.radioCircleActive,
                  ]}
                >
                  {selectedLanguage === lang.code && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Notification Consent */}
        <Card variant="elevated" style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Notifications & Alerts</Text>

          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.switchLabel}>Milk Collection & Payment Alerts</Text>
              <Text style={styles.switchDesc}>
                Receive alerts for daily milk weighment, fat test rates, and monthly bill settlements.
              </Text>
            </View>
            <Switch
              value={notificationConsent}
              onValueChange={setNotificationConsent}
              trackColor={{ false: '#CBD5E1', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        {/* Optional Email */}
        <Card variant="elevated" style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Optional Contact</Text>
          <Input
            label="Email Address (Optional)"
            placeholder="e.g. farmer@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </Card>

        <Button
          title="Save Preferences"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={styles.saveBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  warningCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  warningDesc: {
    fontSize: 11,
    color: '#78350F',
    lineHeight: 16,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: colors.card,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 12,
  },
  langList: {
    gap: 10,
  },
  langItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: '#F8FAFC',
  },
  langItemActive: {
    borderColor: colors.primary,
    backgroundColor: '#EFF6FF',
  },
  langName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  langNameActive: {
    color: colors.primary,
  },
  langNote: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleActive: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  switchDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  saveBtn: {
    marginTop: 10,
  },
});
