import type { Meta, StoryObj } from '@storybook/react-native';

import AccessibilityScreen from '../app/accessibility';

const meta = {
  title: 'Accessibility',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ScreenReaderPlay = {
  parameters: {
    notes:
      'Playing by VoiceOver or TalkBack: the board is one adjustable control with a stable virtual cursor, custom formatters, correlated announcements, and reduced motion.',
  },
  render: () => <AccessibilityScreen />,
} satisfies Story;
