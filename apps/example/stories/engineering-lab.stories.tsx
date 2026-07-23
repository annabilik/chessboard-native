import type { Meta, StoryObj } from '@storybook/react-native';

import InteractionHardeningScreen from '../app/interaction-hardening';

const meta = {
  title: 'Engineering Lab',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const InteractionHardening = {
  parameters: {
    notes:
      'Manual QA stress lab, deliberately outside the chess-concept sections: scrolling, clipping, geometry invalidation, lifecycle cancellation, and render budgets.',
  },
  render: () => <InteractionHardeningScreen />,
} satisfies Story;
