import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme/colors';

export interface ThermalSlipProps {
  slipText: string;
  receiptNumber?: string;
}

export const ThermalSlip: React.FC<ThermalSlipProps> = ({ slipText, receiptNumber }) => {
  return (
    <View style={styles.outerContainer}>
      <View style={styles.paperEdgeTop} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.paper}>
          <Text style={styles.monospaceText}>{slipText}</Text>
        </View>
      </ScrollView>
      <View style={styles.paperEdgeBottom} />
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    marginVertical: 12,
    alignItems: 'center',
    width: '100%',
  },
  paperEdgeTop: {
    height: 4,
    backgroundColor: '#E2E8F0',
    width: '92%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  paperEdgeBottom: {
    height: 6,
    backgroundColor: '#E2E8F0',
    width: '92%',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  scrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  paper: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 16,
    width: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  monospaceText: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
    color: '#0F172A',
  },
});
