import type { Meta, StoryObj } from '@storybook/react-native';

import AccessibilityScreen from '../app/accessibility';

const meta = {
  title: 'Accessibility',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ScreenReaderPlay = {
  name: 'Screen-reader board navigation',
  parameters: {
    notes:
      'Board navigation with VoiceOver or TalkBack: one adjustable control with a stable virtual cursor, correlated announcements, legal position-specific move hints, and reduced motion.',
  },
  render: () => <AccessibilityScreen />,
} satisfies Story;
