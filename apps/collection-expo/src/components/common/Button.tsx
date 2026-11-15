import React from 'react';
import { ViewStyle, TextStyle } from 'react-native';
import { ClayButton } from '../clay/ClayButton';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  isLoading = false,
  disabled = false,
  style,
  textStyle,
}) => {
  return (
    <ClayButton
      title={title}
      onPress={onPress}
      variant={variant}
      isLoading={isLoading}
      disabled={disabled}
      style={style}
      textStyle={textStyle}
    />
  );
};
