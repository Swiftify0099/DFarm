import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';

import { DFARM_COLORS } from '../../design-system/theme';
import {
  DFarmSplashLogo,
  TopLeftLeaves,
  BottomLeftWaves,
  BottomRightLeaves,
  CurvedAccentLine,
  CurvedPastureDivider,
} from '../../assets/vectors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Local hero illustration asset
const HERO_ILLUSTRATION_WEBP = require('../../../assets/images/dfarm-hero-illustration.webp');

export interface DFarmSplashScreenProps {
  onFinish?: () => void;
  isLoading?: boolean;
  minDurationMs?: number;
  autoNavigate?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Circular Orange Loading Spinner with smooth continuous rotation
 */
const DFarmCircularSpinner: React.FC<{ size?: number; color?: string }> = ({
  size = 42,
  color = DFARM_COLORS.primaryOrange,
}) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    animation.start();
    return () => animation.stop();
  }, [rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const strokeWidth = 3.5;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Static track */}
      <View
        style={[
          styles.spinnerTrack,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: '#FFD9BE',
          },
        ]}
      />
      {/* Rotating orange arc */}
      <Animated.View
        style={[
          styles.spinnerArc,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: 'transparent',
            borderTopColor: color,
            borderRightColor: color,
            transform: [{ rotate: spin }],
          },
        ]}
      />
    </View>
  );
};

/**
 * Premium Elegant DFarm Mobile App Splash Screen
 *
 * Implements:
 * - Soft cream and peach gradient with warm sunrise atmosphere
 * - Prominent DFarm branding (3-leaf orange sprout + wordmark + flanked tagline)
 * - Original high-quality soft 3D dairy farm illustration (cow, calf, silos, barn, milk can)
 * - Brand message: "Building a Smarter Dairy Ecosystem Together" with orange emphasis & curved accent arc
 * - Subtle circular orange loading indicator + "Loading..."
 * - Delicate botanical leaves (top-left, bottom-right) & layered flowing waves (bottom-left)
 * - Staggered 6-step lightweight entrance choreography
 * - Responsive scaling for diverse screen sizes with SafeArea protection
 */
export const DFarmSplashScreen: React.FC<DFarmSplashScreenProps> = ({
  onFinish,
  isLoading = true,
  minDurationMs = 2400,
  autoNavigate = true,
  style,
}) => {
  const insets = useSafeAreaInsets();

  // Animation values for staggered choreography
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.92)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(14)).current;
  const messageOpacity = useRef(new Animated.Value(0)).current;
  const messageTranslateY = useRef(new Animated.Value(10)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  // Coordinate dismiss of native launch screen and entrance animation
  useEffect(() => {
    // Hide native splash screen as soon as branded JS splash is mounted
    SplashScreen.hideAsync().catch(() => {
      // Ignore if native splash already hidden
    });

    const useNative = Platform.OS !== 'web';

    // Staggered lightweight entrance choreography with fluid overlapping timings
    const animationSequence = Animated.parallel([
      // Step 1: Background appears smoothly
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.ease),
        useNativeDriver: useNative,
      }),

      // Step 2 & 3: DFarm branding fades in with subtle scale
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        delay: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 400,
        delay: 120,
        easing: Easing.out(Easing.back(1.1)),
        useNativeDriver: useNative,
      }),

      // Step 4: Hero farm illustration fades & slides up smoothly
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 450,
        delay: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),
      Animated.timing(heroTranslateY, {
        toValue: 0,
        duration: 450,
        delay: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),

      // Step 5: Brand message appears
      Animated.timing(messageOpacity, {
        toValue: 1,
        duration: 400,
        delay: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: useNative,
      }),
      Animated.timing(messageTranslateY, {
        toValue: 0,
        duration: 400,
        delay: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: useNative,
      }),

      // Step 6: Loading indicator appears
      Animated.timing(footerOpacity, {
        toValue: 1,
        duration: 350,
        delay: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: useNative,
      }),
    ]);

    animationSequence.start();

    return () => {
      animationSequence.stop();
    };
  }, [
    bgOpacity,
    logoOpacity,
    logoScale,
    heroOpacity,
    heroTranslateY,
    messageOpacity,
    messageTranslateY,
    footerOpacity,
  ]);

  // Handle transition when ready
  useEffect(() => {
    if (autoNavigate && !isLoading && onFinish) {
      const timer = setTimeout(() => {
        onFinish();
      }, minDurationMs);
      return () => clearTimeout(timer);
    }
  }, [autoNavigate, isLoading, minDurationMs, onFinish]);

  // Compute responsive sizing
  const isCompact = SCREEN_HEIGHT < 700;
  const isTablet = SCREEN_WIDTH > 600;
  const heroHeight = isCompact ? 190 : isTablet ? 320 : Math.min(SCREEN_HEIGHT * 0.32, 260);

  return (
    <Animated.View style={[styles.container, { opacity: bgOpacity }, style]}>
      <StatusBar style="dark" />

      {/* Background Gradient: Soft Cream & Light Peach with warm sunrise glow */}
      <LinearGradient
        colors={['#FFF5EE', '#FFF1E8', '#FFE9DC', '#FFF3EB', '#FFF8F4']}
        locations={[0, 0.25, 0.55, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative Top-Left Hanging Leaves */}
      <View style={[styles.topLeftLeavesContainer, { top: insets.top - 6 }]}>
        <TopLeftLeaves width={isCompact ? 95 : 120} height={isCompact ? 88 : 110} />
      </View>

      {/* Decorative Bottom-Left Flowing Waves */}
      <View style={[styles.bottomLeftWavesContainer, { bottom: 0 }]}>
        <BottomLeftWaves width={isCompact ? 120 : 155} height={isCompact ? 80 : 100} />
      </View>

      {/* Decorative Bottom-Right Botanical Leaves */}
      <View style={[styles.bottomRightLeavesContainer, { bottom: insets.bottom + 4 }]}>
        <BottomRightLeaves width={isCompact ? 80 : 105} height={isCompact ? 75 : 98} />
      </View>

      {/* Content Column */}
      <View
        style={[
          styles.contentColumn,
          {
            paddingTop: Math.max(insets.top + (isCompact ? 16 : 28), 36),
            paddingBottom: Math.max(insets.bottom + 12, 20),
          },
        ]}
      >
        {/* 1. DFarm Branding Section (Top-Center) */}
        <Animated.View
          style={[
            styles.brandingSection,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <DFarmSplashLogo
            sproutSize={isCompact ? 48 : 56}
            fontSize={isCompact ? 36 : 42}
            showTagline={true}
          />
        </Animated.View>

        {/* 2. Main Hero Illustration Section */}
        <Animated.View
          style={[
            styles.heroSection,
            {
              height: heroHeight,
              opacity: heroOpacity,
              transform: [{ translateY: heroTranslateY }],
            },
          ]}
        >
          <View style={styles.heroImageWrapper}>
            <Image
              source={HERO_ILLUSTRATION_WEBP}
              defaultSource={HERO_ILLUSTRATION_WEBP}
              style={styles.heroImage}
              contentFit="cover"
              contentPosition="center"
              transition={200}
              accessible
              accessibilityLabel="DFarm Dairy Farm: Holstein cow and calf, farm barn, silos and fresh milk can in morning sunshine"
            />
            {/* Smooth organic bottom pasture curve */}
            <View style={styles.curvedDividerWrapper}>
              <CurvedPastureDivider height={isCompact ? 24 : 32} />
            </View>
          </View>
        </Animated.View>

        {/* 3. Brand Message Section */}
        <Animated.View
          style={[
            styles.messageSection,
            {
              opacity: messageOpacity,
              transform: [{ translateY: messageTranslateY }],
            },
          ]}
        >
          <Text style={[styles.messageLine1, isCompact && styles.messageLineCompact]}>
            Building a Smarter
          </Text>
          <Text style={[styles.messageLine2, isCompact && styles.messageLineCompact]}>
            <Text style={styles.messageHighlight}>Dairy Ecosystem</Text>
            <Text> Together</Text>
          </Text>

          {/* Elegant curved orange accent arc underneath */}
          <View style={styles.accentArcWrapper}>
            <CurvedAccentLine width={isCompact ? 140 : 170} height={10} />
          </View>
        </Animated.View>

        {/* 4. Loading Indicator Section (Bottom-Center) */}
        <Animated.View style={[styles.loadingSection, { opacity: footerOpacity }]}>
          <DFarmCircularSpinner size={isCompact ? 36 : 42} />
          <Text style={styles.loadingText}>Loading...</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
    overflow: 'hidden',
  },
  contentColumn: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },

  /* Decorative elements positioned in corners */
  topLeftLeavesContainer: {
    position: 'absolute',
    left: 0,
    zIndex: 2,
    pointerEvents: 'none',
  },
  bottomLeftWavesContainer: {
    position: 'absolute',
    left: 0,
    zIndex: 2,
    pointerEvents: 'none',
  },
  bottomRightLeavesContainer: {
    position: 'absolute',
    right: 0,
    zIndex: 2,
    pointerEvents: 'none',
  },

  /* 1. Branding Section */
  brandingSection: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 20,
    marginTop: 4,
  },

  /* 2. Hero Section */
  heroSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  heroImageWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  curvedDividerWrapper: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    width: '100%',
  },

  /* 3. Brand Message Section */
  messageSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginVertical: 4,
  },
  messageLine1: {
    fontFamily: 'System',
    fontSize: 23,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 30,
    includeFontPadding: false,
  },
  messageLine2: {
    fontFamily: 'System',
    fontSize: 23,
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 30,
    includeFontPadding: false,
  },
  messageLineCompact: {
    fontSize: 20,
    lineHeight: 26,
  },
  messageHighlight: {
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '800',
  },
  accentArcWrapper: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* 4. Loading Section */
  loadingSection: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 6,
  },
  spinnerTrack: {
    position: 'absolute',
  },
  spinnerArc: {
    position: 'absolute',
  },
  loadingText: {
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '600',
    color: DFARM_COLORS.secondaryText,
    letterSpacing: 0.3,
  },
});
