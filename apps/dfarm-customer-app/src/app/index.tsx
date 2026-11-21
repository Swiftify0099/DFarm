import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../features/auth/useAuth';
import { DFarmSplashScreen } from '../components/splash/DFarmSplashScreen';

export default function Index() {
  const router = useRouter();
  const { session, isLoadingSession } = useAuth();
  const [animationFinished, setAnimationFinished] = useState(false);
  const [hasNavigated, setHasNavigated] = useState(false);

  const navigateToDestination = useCallback(() => {
    if (hasNavigated) return;
    setHasNavigated(true);

    if (session?.token) {
      if (session.status === 'PENDING_APPROVAL') {
        router.replace('/(onboarding)/pending-approval');
      } else {
        router.replace('/(main)');
      }
    } else {
      router.replace('/(auth)/login');
    }
  }, [hasNavigated, session, router]);

  const handleAnimationFinish = useCallback(() => {
    setAnimationFinished(true);
  }, []);

  // When animation has completed and session loading is resolved, perform transition
  useEffect(() => {
    if (animationFinished && !isLoadingSession && !hasNavigated) {
      navigateToDestination();
    }
  }, [animationFinished, isLoadingSession, hasNavigated, navigateToDestination]);

  return (
    <DFarmSplashScreen
      isLoading={isLoadingSession}
      minDurationMs={1800}
      onFinish={handleAnimationFinish}
    />
  );
}
