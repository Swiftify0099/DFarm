import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_SHADOWS, DFARM_TYPOGRAPHY } from '../../design-system/theme';
import {
  NavHomeIcon,
  NavMilkIcon,
  NavKhataIcon,
  NavBillsIcon,
  NavProfileIcon,
} from '../../assets/vectors/NavAssets';

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
            <TabIconSlot focused={focused}>
              <NavHomeIcon size={22} color={color ? String(color) : DFARM_COLORS.secondaryText} />
            </TabIconSlot>
          ),
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'Milk',
          tabBarIcon: ({ color, focused }) => (
            <TabIconSlot focused={focused}>
              <NavMilkIcon size={22} color={color ? String(color) : DFARM_COLORS.secondaryText} />
            </TabIconSlot>
          ),
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: 'Khata',
          tabBarIcon: ({ color, focused }) => (
            <TabIconSlot focused={focused}>
              <NavKhataIcon size={22} color={color ? String(color) : DFARM_COLORS.secondaryText} />
            </TabIconSlot>
          ),
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
          title: 'Bills',
          tabBarIcon: ({ color, focused }) => (
            <TabIconSlot focused={focused}>
              <NavBillsIcon size={22} color={color ? String(color) : DFARM_COLORS.secondaryText} />
            </TabIconSlot>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIconSlot focused={focused}>
              <NavProfileIcon size={22} color={color ? String(color) : DFARM_COLORS.secondaryText} />
            </TabIconSlot>
          ),
        }}
      />
    </Tabs>
  );
}

function TabIconSlot({
  children,
  focused,
}: {
  children: React.ReactNode;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconWrapper, focused && styles.iconWrapperFocused]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.5,
    borderTopColor: DFARM_COLORS.border,
    height: Platform.OS === 'ios' ? 84 : 68,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    ...DFARM_SHADOWS.clayTabBar,
  },
  tabLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  iconWrapper: {
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DFARM_RADIUS.pill,
  },
  iconWrapperFocused: {
    backgroundColor: DFARM_COLORS.peach,
  },
});
