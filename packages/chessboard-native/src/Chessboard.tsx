import { StyleSheet, View } from 'react-native';

/**
 * Temporary package-wiring surface for the Phase 0 gallery.
 *
 * The controlled position and interaction contract deliberately lands later.
 */
export function Chessboard() {
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.frame}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#e7e0d2',
    borderColor: '#9c8f7a',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
