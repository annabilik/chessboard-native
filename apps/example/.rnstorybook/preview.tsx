import { withBackgrounds } from '@storybook/addon-ondevice-backgrounds';
import type { Preview } from '@storybook/react-native';

const preview = {
  decorators: [withBackgrounds],
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    backgrounds: {
      default: 'gallery',
      values: [
        { name: 'gallery', value: '#f4f1eb' },
        { name: 'dark', value: '#171717' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    layout: 'fullscreen',
    options: {
      storySort: {
        order: [
          'Overview',
          'Gallery',
          [
            'Controlled State',
            'Interaction and Composition',
            'Presentation and Accessibility',
            'Migration',
          ],
        ],
      },
    },
  },
} satisfies Preview;

export default preview;
