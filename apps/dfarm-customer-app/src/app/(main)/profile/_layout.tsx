import React from 'react';
import { Stack } from 'expo-router';

export default function ProfileStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="diagnostics" />
      <Stack.Screen name="update-face" />
    </Stack>
  );
}
