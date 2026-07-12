import { Color } from 'expo-router';
import { type ReactElement } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  type ColorValue,
} from 'react-native';

export interface ScreenColors {
  readonly background: ColorValue;
  readonly border: ColorValue;
  readonly button: ColorValue;
  readonly buttonText: ColorValue;
  readonly card: ColorValue;
  readonly secondaryText: ColorValue;
  readonly text: ColorValue;
}

export function useScreenColors(): ScreenColors {
  useColorScheme();
  return {
    background: Platform.select({
      android: Color.android.attr.colorBackground,
      default: '#ffffff',
      ios: Color.ios.systemBackground,
    }),
    border: Platform.select({
      android: Color.android.attr.colorControlNormal,
      default: '#d0d0d0',
      ios: Color.ios.separator,
    }),
    button: Platform.select({
      android: Color.android.attr.colorAccent,
      default: '#236a5b',
      ios: Color.ios.systemBlue,
    }),
    buttonText: Platform.select({
      android: Color.android.attr.colorForegroundInverse,
      default: '#ffffff',
      ios: Color.ios.white,
    }),
    card: Platform.select({
      android: Color.android.attr.colorBackgroundFloating,
      default: '#f3f3f3',
      ios: Color.ios.secondarySystemBackground,
    }),
    secondaryText: Platform.select({
      android: Color.android.attr.colorControlNormal,
      default: '#656565',
      ios: Color.ios.secondaryLabel,
    }),
    text: Platform.select({
      android: Color.android.attr.colorForeground,
      default: '#1d1d1d',
      ios: Color.ios.label,
    }),
  };
}

export function ControlButton({
  colors,
  label,
  onPress,
}: {
  readonly colors: ScreenColors;
  readonly label: string;
  readonly onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, { backgroundColor: colors.button }]}
    >
      <Text style={[styles.buttonText, { color: colors.buttonText }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
