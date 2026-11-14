import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { colors } from '../../components/theme/colors';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { authApi } from '../../api/auth.api';
import { useAuth } from '../../context/AuthContext';

export interface LoginScreenProps {
  navigation: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { loginWithStaffDevToken, isLoading } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [isDevMode, setIsDevMode] = useState(false);
  const [devUsername, setDevUsername] = useState('sangli_owner');

  const handleSendOtp = async () => {
    setPhoneError('');

    const trimmed = phoneNumber.trim();
    if (!trimmed) {
      setPhoneError('Please enter your 10-digit registered mobile number');
      return;
    }

    // Must be valid Indian 10-digit phone
    const cleanDigits = trimmed.replace(/\D/g, '');
    const normalized = cleanDigits.length === 12 && cleanDigits.startsWith('91')
      ? cleanDigits.slice(2)
      : cleanDigits;

    if (normalized.length !== 10) {
      setPhoneError('Please enter a valid 10-digit mobile number');
      return;
    }

    const fullE164 = `+91${normalized}`;
    setIsSubmitting(true);

    try {
      // Calls backend which invokes Supabase signInWithOtp with shouldCreateUser: false
      const result = await authApi.sendOtp(fullE164);
      navigation.navigate('OtpVerification', {
        phone: result.phone || fullE164,
        displayPhone: normalized,
      });
    } catch (err: any) {
      const msg = err.message || 'Failed to dispatch verification code';
      Alert.alert(
        'Login Error',
        msg + '\n\nNote: If testing locally without an SMS provider, use the Dev Account Switcher below.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDevLogin = async () => {
    if (!devUsername.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }
    setIsSubmitting(true);
    try {
      await loginWithStaffDevToken(devUsername.trim());
    } catch (err: any) {
      Alert.alert('Dev Login Error', err.message || 'Failed to authenticate');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header Banner */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>DFARM</Text>
            </View>
            <Text style={styles.title}>DFarm Customer Portal</Text>
            <Text style={styles.subtitle}>
              Smart Dairy Farmer Self-Service Mobile Application
            </Text>
          </View>

          {/* Login Card */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Farmer Login</Text>
            <Text style={styles.cardSubtitle}>
              Enter your mobile number registered with your dairy center
            </Text>

            <Input
              label="Registered Mobile Number"
              placeholder="e.g. 9876543210"
              keyboardType="phone-pad"
              maxLength={13}
              value={phoneNumber}
              onChangeText={text => {
                setPhoneNumber(text);
                if (phoneError) setPhoneError('');
              }}
              error={phoneError}
            />

            <Button
              title="Get Verification Code (OTP)"
              onPress={handleSendOtp}
              loading={isSubmitting}
              disabled={isSubmitting || isLoading}
              style={styles.submitBtn}
            />

            <View style={styles.securityNotice}>
              <Text style={styles.securityTitle}>🛡️ Security & Identity Protection</Text>
              <Text style={styles.securityDesc}>
                Login uses verified Supabase Authentication. Only officially registered dairy customers can log in. New unverified accounts cannot be created from this app.
              </Text>
            </View>
          </Card>

          {/* Dev / Staging Account Switcher */}
          <View style={styles.devSection}>
            <TouchableOpacity
              onPress={() => setIsDevMode(!isDevMode)}
              style={styles.devToggle}
            >
              <Text style={styles.devToggleText}>
                {isDevMode ? '▼ Hide Developer / Staging Login' : '▶ Developer / Staging Token Login'}
              </Text>
            </TouchableOpacity>

            {isDevMode && (
              <Card variant="outlined" style={styles.devCard}>
                <Text style={styles.devHeader}>Dev Environment Onboarding</Text>
                <Text style={styles.devDesc}>
                  Sign in with an active dairy user or customer token for automated testing:
                </Text>

                <Input
                  label="Username or Staff Handle"
                  placeholder="e.g. sangli_owner or supervisor1"
                  value={devUsername}
                  onChangeText={setDevUsername}
                  autoCapitalize="none"
                />

                <Button
                  title="Authenticate Session"
                  variant="secondary"
                  size="sm"
                  onPress={handleDevLogin}
                  loading={isSubmitting}
                  style={styles.devSubmitBtn}
                />
              </Card>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 12,
  },
  logoText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 20,
    letterSpacing: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    padding: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  submitBtn: {
    marginTop: 12,
  },
  securityNotice: {
    marginTop: 20,
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 8,
  },
  securityTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  securityDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  devSection: {
    marginTop: 24,
  },
  devToggle: {
    alignItems: 'center',
    padding: 8,
  },
  devToggleText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  devCard: {
    marginTop: 8,
    padding: 14,
    backgroundColor: '#F8FAFC',
  },
  devHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  devDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginVertical: 6,
  },
  devSubmitBtn: {
    marginTop: 8,
  },
});
