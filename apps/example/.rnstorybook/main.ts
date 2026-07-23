import type { StorybookConfig } from '@storybook/react-native';

const config = {
  deviceAddons: [
    '@storybook/addon-ondevice-actions',
    '@storybook/addon-ondevice-controls',
    '@storybook/addon-ondevice-notes',
  ],
  framework: '@storybook/react-native',
  stories: ['../stories/**/*.stories.?(ts|tsx)'],
} satisfies StorybookConfig;

export default config;
