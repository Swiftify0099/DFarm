import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_SHADOWS } from '../../design-system/theme';

export default function MainTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: DFARM_COLORS.primaryOrange,
        tabBarInactiveTintColor: DFARM_COLORS.secondaryText,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon="🏠" label="Home" color={color ? String(color) : '#817A75'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'Collection',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon="🥛" label="Milk" color={color ? String(color) : '#817A75'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: 'Ledger',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon="📖" label="Khata" color={color ? String(color) : '#817A75'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
          title: 'Bills',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon="🧾" label="Bills" color={color ? String(color) : '#817A75'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon="👤" label="Profile" color={color ? String(color) : '#817A75'} focused={focused} />
          ),
        }}
      />
      {/* Hidden sub-routes inside profile stack */}
      <Tabs.Screen
        name="profile/diagnostics"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile/update-face"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  icon,
  focused,
}: {
  icon: string;
  label: string;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconWrapper, focused && styles.iconWrapperFocused]}>
      <Text style={styles.iconEmoji}>{icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: DFARM_COLORS.border,
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
    borderTopLeftRadius: DFARM_RADIUS.lg,
    borderTopRightRadius: DFARM_RADIUS.lg,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    ...DFARM_SHADOWS.clayTabBar,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: DFARM_RADIUS.pill,
  },
  iconWrapperFocused: {
    backgroundColor: DFARM_COLORS.peach,
  },
  iconEmoji: {
    fontSize: 16,
  },
});
