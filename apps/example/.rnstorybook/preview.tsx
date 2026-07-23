import type { Preview } from '@storybook/react-native';

const preview = {
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
