import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  ClayCard,
  ClayButton,
  ClayOTPInput,
  ClayHeader,
  ClayBadge,
} from '../../design-system';
import { useAuth } from '../../features/auth/useAuth';
import { DirectDoveSmsService } from '../../services/smsService';

export default function VerifyOtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mobileNumber?: string }>();
  const mobileNumber = params.mobileNumber || '';
  const { verifyOtp, isVerifyingOtp, requestOtp } = useAuth();

  const [otp, setOtp] = useState('');
  const [timer, setTimer] = useState(60);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleResend = async () => {
    if (timer > 0) return;
    setError(null);
    setTimer(60);
    try {
      await requestOtp({ mobileNumber });
    } catch (err: any) {
      try {
        await DirectDoveSmsService.sendDirectDoveOtp(mobileNumber);
      } catch {
        setError(err?.response?.data?.message || 'Failed to resend OTP. Please retry.');
      }
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) {
      setError('Please enter all 6 digits of your verification code');
      return;
    }

    try {
      const session = await verifyOtp({
        mobileNumber,
        otp,
      });

      if (session.user.status === 'APPROVED') {
        router.replace('/(main)');
      } else if (session.user.status === 'PENDING_APPROVAL') {
        router.replace('/(onboarding)/pending-approval');
      } else {
        router.replace({
          pathname: '/(onboarding)/dairy-discovery',
          params: { mobileNumber },
        });
      }
    } catch (err: any) {
      // Check emergency direct SMS verification fallback
      const isDirectValid = await DirectDoveSmsService.verifyDirectDoveOtp(mobileNumber, otp);
      if (isDirectValid) {
        router.replace({
          pathname: '/(onboarding)/dairy-discovery',
          params: { mobileNumber },
        });
        return;
      }

      setError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Invalid or expired verification code'
      );
    }
  };

  const maskedNumber =
    mobileNumber.length === 10
      ? `+91 ${mobileNumber.slice(0, 2)}*** ***${mobileNumber.slice(8)}`
      : `+91 ${mobileNumber}`;

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Security Verification"
        subtitle="ओटीपी पडताळणी"
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ClayCard variant="raised" style={styles.card}>
            <View style={styles.badgeRow}>
              <ClayBadge label="Step 2 of 2: OTP Security" variant="orange" />
            </View>

            <Text style={styles.heading}>Enter 6-Digit Code</Text>
            <Text style={styles.subtitle}>
              Code dispatched via SMS to <Text style={styles.boldText}>{maskedNumber}</Text>
            </Text>

            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.changeNumberBtn, pressed && styles.pressed]}
            >
              <Text style={styles.changeNumberText}>Edit Phone Number / नंबर बदला</Text>
            </Pressable>

            <ClayOTPInput
              value={otp}
              onChange={(val) => {
                setOtp(val);
                if (error) setError(null);
              }}
              error={!!error}
            />

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            )}

            <ClayButton
              title="Verify & Continue"
              onPress={handleVerify}
              loading={isVerifyingOtp}
              disabled={otp.length !== 6}
              style={styles.verifyBtn}
            />

            <View style={styles.resendRow}>
              <Text style={styles.resendLabel}>Didn't receive code? </Text>
              {timer > 0 ? (
                <View style={styles.timerPill}>
                  <Text style={styles.timerText}>Resend in {timer}s</Text>
                </View>
              ) : (
                <Pressable onPress={handleResend} style={({ pressed }) => pressed && styles.pressed}>
                  <Text style={styles.resendAction}>Resend OTP Now</Text>
                </Pressable>
              )}
            </View>
          </ClayCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  card: {
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  badgeRow: {
    marginBottom: 12,
  },
  heading: {
    ...DFARM_TYPOGRAPHY.h1,
    color: DFARM_COLORS.primaryText,
    marginBottom: 6,
  },
  subtitle: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
    lineHeight: 20,
    marginBottom: 8,
  },
  boldText: {
    color: DFARM_COLORS.primaryText,
    fontWeight: '700',
  },
  changeNumberBtn: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  changeNumberText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  errorBox: {
    backgroundColor: '#FFF8F8',
    borderColor: '#FFCDD2',
    borderWidth: 1,
    borderRadius: DFARM_RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  errorText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.error,
    fontWeight: '500',
  },
  verifyBtn: {
    marginTop: 8,
    marginBottom: 18,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  timerPill: {
    backgroundColor: DFARM_COLORS.surfaceInset,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: DFARM_RADIUS.pill,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
  },
  timerText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
  },
  resendAction: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.75,
  },
});
