import type { StorybookConfig } from '@storybook/react-native-web-vite';

/**
 * Web preview of the same story files the on-device catalog uses. It renders
 * through react-native-web, which is NOT a supported target of the library;
 * see docs/storybook.md for the boundary this preview does not move.
 *
 * `react-native-web` is a root dev dependency rather than an app-level one so
 * that the bare "react-native" -> "react-native-web" alias also resolves from
 * inside packages/chessboard-native, which pnpm otherwise isolates.
 */
const config = {
  framework: {
    name: '@storybook/react-native-web-vite',
    options: {
      modulesToTranspile: [
        '@vibechess/chessboard-native',
        'react-native-gesture-handler',
        'react-native-reanimated',
        'react-native-safe-area-context',
        'react-native-svg',
        'react-native-worklets',
      ],
      pluginReactOptions: {
        babel: {
          plugins: ['react-native-worklets/plugin'],
        },
      },
    },
  },
  stories: ['../stories/**/*.stories.?(ts|tsx)'],
} satisfies StorybookConfig;

export default config;
