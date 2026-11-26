/**
 * DFarm Customer Login Screen
 *
 * Layout anchored to reference screenshot proportions (341×722px):
 *   Status bar:        y=0–29   (4%)
 *   DFarm branding:    y=100–162 (22%)
 *   Hero illustration: y=162–350 (26% height = ~26% of screen)
 *   Badge:             y=358–400 (card top)
 *   Heading:           y=400–435
 *   Subtitle:          y=435–460
 *   Input:             y=460–521
 *   Button:            y=571–617
 *   Terms:             y=644–666
 *   Bottom decors:     y=660–722
 *
 * All measurements scaled proportionally to device height.
 * Authentication logic is 100% unchanged.
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import {
  DFarmSproutBrandMark,
  BottomLeftWaves,
  BottomRightLeaves,
  ShieldCheckIcon,
  ChevronDownIcon,
} from '../../assets/vectors';
import { useAuth } from '../../features/auth/useAuth';

// ─── Reference proportions ───────────────────────────────────────────────────
// Reference: 341×722px. We scale proportionally to device screen height.
const REF_H = 722;

// Hero illustration zone: y=162 to y=350 → height=188px out of 722px = 26.04%
// Logo zone: y=100 to y=162 → height=62px = 8.59%
// Card zone: y=350 to y=722 → height=372px = 51.52%

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

// Scale a reference pixel value to current device height
const sh = (refPx: number) => Math.round((refPx / REF_H) * SCREEN_H);

// Pre-computed key dimensions
const HERO_HEIGHT = sh(188);         // 26% of screen → ~200dp on 812dp screen
const BRAND_PADDING_TOP = sh(55);    // logo zone top margin
const BRAND_PADDING_BOT = sh(10);    // logo zone bottom margin
const CARD_OVERLAP = -sh(16);        // card overlaps hero by 16dp
const CARD_PADDING_TOP = sh(10);     // badge sits 10dp from card top

// Pixel-perfect OTP Button dimensions per reference specifications:
// Width: ~79.5% of screen width; Height: ~6.7% of screen height
const BUTTON_WIDTH = Math.round(SCREEN_W * 0.795);
const BUTTON_HEIGHT = Math.round(SCREEN_H * 0.067);
const BUTTON_RADIUS = Math.round(BUTTON_HEIGHT / 2);

export default function LoginScreen() {
  const router = useRouter();
  const { requestOtp, isRequestingOtp } = useAuth();
  const [mobileNumber, setMobileNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);

  const handleSendOtp = async () => {
    setError(null);
    const cleaned = mobileNumber.replace(/\D/g, '');

    if (cleaned.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    if (!/^[6-9]\d{9}$/.test(cleaned)) {
      setError('Mobile number must begin with digits 6, 7, 8, or 9');
      return;
    }

    try {
      await requestOtp({ mobileNumber: cleaned });
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { mobileNumber: cleaned },
      });
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to dispatch SMS verification. Please check network connection.'
      );
    }
  };

  const isFormValid = mobileNumber.replace(/\D/g, '').length === 10;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── 1. Brand Header ───────────────────────────────────────────── */}
          {/* Reference: y=100–162 (8.6% of 722px). paddingTop = status-bar gap. */}
          <View style={[styles.brandContainer, {
            paddingTop: BRAND_PADDING_TOP,
            paddingBottom: BRAND_PADDING_BOT,
          }]}>
            <DFarmSproutBrandMark size={40} />
          </View>

          {/* ── 2. Hero Illustration ──────────────────────────────────────── */}
          {/* Reference: y=162–350 (26% of screen). resizeMode=contain keeps */}
          {/* entire composition (cow+calf+silos+milk can) fully visible.     */}
          <View style={[styles.heroContainer, { height: HERO_HEIGHT }]}>
            <Image
              source={require('../../../assets/images/dairy-farm-hero.png')}
              style={styles.heroImage}
              resizeMode="contain"
            />
          </View>

          {/* ── 3. Login Card ─────────────────────────────────────────────── */}
          {/* White-cream card with rounded top, overlapping hero by 16dp.    */}
          <View style={[styles.cardContainer, {
            marginTop: CARD_OVERLAP,
            paddingTop: CARD_PADDING_TOP,
          }]}>

            {/* Customer & Farmer Portal badge */}
            <View style={styles.badgeWrapper}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Customer &amp; Farmer Portal</Text>
              </View>
            </View>

            {/* Heading */}
            <Text style={styles.heading}>Enter Mobile Number</Text>

            {/* Subtitle — 2 lines */}
            <Text style={styles.subtitle}>
              We will send an instant SMS verification code{'\n'}to connect with your dairy.
            </Text>

            {/* Mobile number input */}
            <Pressable
              onPress={() => inputRef.current?.focus()}
              style={[
                styles.inputWrapper,
                isFocused && styles.inputFocused,
                !!error && styles.inputError,
              ]}
            >
              {/* Country code prefix */}
              <View style={styles.prefixGroup}>
                <Text style={styles.prefixText}>+91</Text>
                <ChevronDownIcon size={9} color="#2A1A0A" style={styles.chevron} />
              </View>

              {/* Vertical separator */}
              <View style={styles.inputDivider} />

              {/* Phone number text field */}
              <TextInput
                ref={inputRef}
                style={styles.textInput}
                placeholder="Mobile Number"
                placeholderTextColor="#B0A498"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="done"
                maxLength={10}
                value={mobileNumber}
                onChangeText={(text) => {
                  setMobileNumber(text.replace(/[^0-9]/g, ''));
                  if (error) setError(null);
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onSubmitEditing={isFormValid ? handleSendOtp : undefined}
              />
            </Pressable>

            {/* Validation error */}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Get OTP CTA button — Pixel-perfect reference match */}
            <Pressable
              onPress={handleSendOtp}
              disabled={isRequestingOtp}
              style={({ pressed }) => [
                styles.buttonShadow,
                pressed && styles.buttonPressed,
              ]}
            >
              <LinearGradient
                colors={['#FF7E10', '#FF6A00']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.buttonGradient}
              >
                {isRequestingOtp ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Get OTP Verification Code</Text>
                )}
              </LinearGradient>
            </Pressable>

            {/* Terms & Privacy */}
            <View style={styles.termsRow}>
              <ShieldCheckIcon size={13} style={styles.shieldIcon} />
              <Text style={styles.termsText}>
                By proceeding, you agree to DFarm's{' '}
                <Text style={styles.termsPolicy}>Milk Producer Service Terms &amp; Biometric Policy.</Text>
              </Text>
            </View>

            {/* Bottom decorative vectors */}
            <View style={styles.decorBottomLeft} pointerEvents="none">
              <BottomLeftWaves width={140} height={90} />
            </View>
            <View style={styles.decorBottomRight} pointerEvents="none">
              <BottomRightLeaves width={90} height={85} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Global ────────────────────────────────────────────────────────────
  safeArea: {
    flex: 1,
    backgroundColor: '#FEECE0', // warm peach canvas — matches reference background
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#FEECE0',
  },

  // ── Brand header ──────────────────────────────────────────────────────
  // paddingTop/Bottom set dynamically above
  brandContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Hero illustration ─────────────────────────────────────────────────
  // height set dynamically above. backgroundColor matches top-of-image blend.
  heroContainer: {
    width: '100%',
    backgroundColor: '#FEECE0', // behind the illustration during load
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },

  // ── Login card ────────────────────────────────────────────────────────
  // marginTop/paddingTop set dynamically above
  cardContainer: {
    flex: 1,
    backgroundColor: '#FFF9F3',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
    // Subtle upward shadow for depth
    shadowColor: '#B07040',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 8,
  },

  // ── Badge ─────────────────────────────────────────────────────────────
  // Reference: 29px tall in 341px image, centered pill, peach background
  badgeWrapper: {
    alignItems: 'center',
    marginBottom: 10,
  },
  badge: {
    backgroundColor: '#FDDFC4',
    borderWidth: 1,
    borderColor: '#F5C09A',
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  badgeText: {
    color: '#C45200',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // ── Heading ───────────────────────────────────────────────────────────
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A0E06',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.4,
  },

  // ── Subtitle ──────────────────────────────────────────────────────────
  subtitle: {
    fontSize: 13,
    color: '#6A5A50',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },

  // ── Input field ───────────────────────────────────────────────────────
  // Reference: 61px tall (8.4% of 722), rounded pill, light background
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF3EC',
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: '#EAD9CC',
    height: 52,
    paddingHorizontal: 16,
    marginBottom: sh(24),
  },
  inputFocused: {
    borderColor: '#FF7000',
    backgroundColor: '#FFFFFF',
    shadowColor: '#FF7000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
  },
  inputError: {
    borderColor: '#D32F2F',
    backgroundColor: '#FFF8F8',
  },

  // ── Input prefix (+91 ∨) ──────────────────────────────────────────────
  prefixGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  prefixText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A0E06',
    marginRight: 3,
  },
  chevron: {
    marginTop: 1,
  },
  inputDivider: {
    width: 1.5,
    height: 22,
    backgroundColor: '#D8C8BC',
    marginHorizontal: 10,
  },
  textInput: {
    flex: 1,
    height: 48,
    fontSize: 15,
    fontWeight: '500',
    color: '#1A0E06',
    paddingVertical: 0,
  },

  // ── Error text ────────────────────────────────────────────────────────
  errorText: {
    fontSize: 11.5,
    color: '#C0392B',
    textAlign: 'center',
    marginTop: -10,
    marginBottom: 10,
    fontWeight: '500',
  },

  // ── CTA button — Pixel-perfect reference match ────────────────────────
  // Reference: 79.5% screen width, 6.7% screen height, pill shape, soft orange shadow
  buttonShadow: {
    width: BUTTON_WIDTH,
    alignSelf: 'center',
    borderRadius: BUTTON_RADIUS,
    shadowColor: '#FF6A00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: sh(22),
  },
  buttonPressed: {
    opacity: 0.90,
    transform: [{ scale: 0.985 }],
  },
  buttonGradient: {
    height: BUTTON_HEIGHT,
    borderRadius: BUTTON_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.15,
    textAlign: 'center',
  },

  // ── Terms & Privacy ───────────────────────────────────────────────────
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  shieldIcon: {
    marginRight: 5,
    marginTop: 2,
    flexShrink: 0,
  },
  termsText: {
    fontSize: 11,
    color: '#6A5A50',
    lineHeight: 16,
    flex: 1,
  },
  termsPolicy: {
    color: '#4A3828',
    fontWeight: '600',
  },

  // ── Bottom decorations ────────────────────────────────────────────────
  // Absolutely positioned at card corners, behind all content
  decorBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 140,
    height: 90,
  },
  decorBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 90,
    height: 85,
  },
});
