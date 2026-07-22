import type { Meta, StoryObj } from '@storybook/react-native';

import ControlledAnnotationsScreen from '../app/controlled-annotations';
import ControlledSelectionScreen from '../app/controlled-selection';
import ControlledMoveRequestsScreen from '../app/move-request';
import PromotionAndPremovesScreen from '../app/rules-owned-moves';

const meta = {
  parameters: { layout: 'fullscreen' },
  title: 'Gallery/Controlled State',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ControlledAnnotations = {
  parameters: {
    notes:
      'Consumer-owned arrow and square collections with revision-safe annotation operations.',
  },
  render: () => <ControlledAnnotationsScreen />,
} satisfies Story;

export const ControlledSelection = {
  parameters: {
    notes:
      'Selected, destination, and disabled squares remain declarative consumer state.',
  },
  render: () => <ControlledSelectionScreen />,
} satisfies Story;

export const ControlledMoveRequests = {
  parameters: {
    notes:
      'Accept, reject, cancel, and exercise decision/commit timeouts without creating a second position store; custom accessibility formatters expose square and terminal-outcome payloads.',
  },
  render: () => <ControlledMoveRequestsScreen />,
} satisfies Story;

export const PromotionAndPremoves = {
  parameters: {
    notes:
      'Promotion choice and premove queues stay in application-owned rules state.',
  },
  render: () => <PromotionAndPremovesScreen />,
} satisfies Story;
