import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { ClayDeviceBadge, DeviceState } from './ClayDeviceBadge';

export interface ClayHardwareHUDProps {
  scaleState?: DeviceState;
  scaleLabel?: string;
  analyzerState?: DeviceState;
  analyzerLabel?: string;
  rfidState?: DeviceState;
  rfidLabel?: string;
  printerState?: DeviceState;
  printerLabel?: string;
  style?: ViewStyle;
}

export const ClayHardwareHUD: React.FC<ClayHardwareHUDProps> = ({
  scaleState = 'MANUAL_ENTRY',
  scaleLabel,
  analyzerState = 'MANUAL_ENTRY',
  analyzerLabel,
  rfidState = 'CONNECTED',
  rfidLabel = 'NFC / USB',
  printerState = 'CONNECTED',
  printerLabel = 'BT ESC/POS',
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <ClayDeviceBadge
        deviceType="SCALE"
        state={scaleState}
        customLabel={scaleLabel || (scaleState === 'CONNECTED' ? 'USB SCALE' : 'MANUAL SCALE')}
      />
      <ClayDeviceBadge
        deviceType="ANALYZER"
        state={analyzerState}
        customLabel={analyzerLabel || (analyzerState === 'CONNECTED' ? 'ANALYZER' : 'MANUAL QC')}
      />
      <ClayDeviceBadge
        deviceType="RFID"
        state={rfidState}
        customLabel={rfidLabel}
      />
      <ClayDeviceBadge
        deviceType="PRINTER"
        state={printerState}
        customLabel={printerLabel}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
});
