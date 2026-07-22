import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Storage as StorybookStorage } from '@storybook/react-native';
import { LiteUI } from '@storybook/react-native-ui-lite';
import { registerRootComponent } from 'expo';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { view } from './storybook.requires';

const storage = {
  getItem: AsyncStorage.getItem,
  setItem: AsyncStorage.setItem,
} satisfies StorybookStorage;

const StorybookUI = view.getStorybookUI({
  CustomUIComponent: LiteUI,
  shouldPersistSelection: true,
  storage,
});

function StorybookRoot() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StorybookUI />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

registerRootComponent(StorybookRoot);
