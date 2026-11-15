import React from 'react';
import { ViewStyle } from 'react-native';
import { ClayDialog } from '../clay/ClayDialog';

export interface DialogProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
}

export const Dialog: React.FC<DialogProps> = ({
  visible,
  onDismiss,
  children,
  contentStyle,
}) => {
  return (
    <ClayDialog visible={visible} onDismiss={onDismiss} contentStyle={contentStyle}>
      {children}
    </ClayDialog>
  );
};
