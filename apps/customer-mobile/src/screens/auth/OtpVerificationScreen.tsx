import React, { useState, useEffect } from 'react';
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

export interface OtpVerificationScreenProps {
  route: {
    params: {
      phone: string;
      displayPhone: string;
    };
  };
  navigation: any;
}

export const OtpVerificationScreen: React.FC<OtpVerificationScreenProps> = ({
  route,
  navigation,
}) => {
  const { phone, displayPhone } = route.params;
  const { loginWithOtpSession } = useAuth();
  const [token, setToken] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(30);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleVerify = async () => {
    setErrorMsg('');
    const cleanToken = token.trim();
    if (cleanToken.length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code');
      return;
    }

    setIsVerifying(true);
    try {
      const response = await authApi.verifyOtp(phone, cleanToken);

      if (!response.session?.access_token) {
        throw new Error('Verification failed. No active session token returned.');
      }

      await loginWithOtpSession(response.session.access_token);
    } catch (err: any) {
      const msg = err.message || 'Invalid or expired verification code';
      setErrorMsg(msg);
      Alert.alert('Verification Failed', msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await authApi.sendOtp(phone);
      setResendCooldown(30);
      Alert.alert('OTP Dispatched', 'A new verification code has been sent to your mobile number.');
    } catch (err: any) {
      Alert.alert('Resend Failed', err.message || 'Could not send verification code');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Enter Verification Code</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to +91 {displayPhone}
            </Text>
          </View>

          <Card style={styles.card}>
            <Input
              label="6-Digit OTP Code"
              placeholder="e.g. 123456"
              keyboardType="number-pad"
              maxLength={6}
              value={token}
              onChangeText={text => {
                setToken(text);
                if (errorMsg) setErrorMsg('');
              }}
              error={errorMsg}
            />

            <Button
              title="Verify & Continue"
              onPress={handleVerify}
              loading={isVerifying}
              disabled={isVerifying || token.trim().length !== 6}
              style={styles.submitBtn}
            />

            <View style={styles.resendRow}>
              <Text style={styles.resendPrompt}>Didn't receive code? </Text>
              {resendCooldown > 0 ? (
                <Text style={styles.countdownText}>Resend in {resendCooldown}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResend}>
                  <Text style={styles.resendLink}>Resend OTP</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.changePhoneBtn}
            >
              <Text style={styles.changePhoneText}>Change Mobile Number</Text>
            </TouchableOpacity>
          </Card>
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
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
  card: {
    padding: 20,
  },
  submitBtn: {
    marginTop: 12,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  resendPrompt: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  countdownText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  resendLink: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  changePhoneBtn: {
    alignItems: 'center',
    marginTop: 16,
    padding: 8,
  },
  changePhoneText: {
    fontSize: 13,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
