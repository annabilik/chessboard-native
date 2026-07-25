import type { Preview } from '@storybook/react-native-web-vite';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * The native entry point mounts these two roots for the whole app. On web the
 * story is the root, so each story needs them: gesture handling for board
 * input, and a safe-area provider because the gallery screens reused as
 * stories render inside `SafeAreaView`, which renders nothing on web without
 * a provider above it.
 */
const preview = {
  decorators: [
    (Story) => (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <Story />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    options: {
      storySort: {
        order: [
          'Overview',
          'Play a Game',
          'Analysis and Training',
          'Board Setup and Variants',
          'Look and Feel',
          'Accessibility',
          'Migration',
          'Engineering Lab',
        ],
      },
    },
  },
} satisfies Preview;

export default preview;
