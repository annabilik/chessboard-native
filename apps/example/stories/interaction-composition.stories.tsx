import type { Meta, StoryObj } from '@storybook/react-native';

import InteractionHardeningScreen from '../app/interaction-hardening';
import PieceCallbacksScreen from '../app/piece-callbacks';
import ProviderCoordinationScreen from '../app/provider-coordination';
import SparePiecesScreen from '../app/spare-pieces';
import SquarePressCallbacksScreen from '../app/square-press-callbacks';

const meta = {
  parameters: { layout: 'fullscreen' },
  title: 'Gallery/Interaction and Composition',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ProviderCoordination = {
  parameters: {
    notes:
      'Two independently controlled boards share one explicit provider and drag overlay host.',
  },
  render: () => <ProviderCoordinationScreen />,
} satisfies Story;

export const SparePieces = {
  parameters: {
    notes:
      'Reusable and disabled external sources target one named rectangular board.',
  },
  render: () => <SparePiecesScreen />,
} satisfies Story;

export const PieceCallbacks = {
  parameters: {
    notes:
      'Piece press and drag-start callbacks observe interaction without mutating controlled state.',
  },
  render: () => <PieceCallbacksScreen />,
} satisfies Story;

export const SquarePressCallbacks = {
  parameters: {
    notes:
      'Square press boundaries report canonical occupied and empty squares without claiming the gesture.',
  },
  render: () => <SquarePressCallbacksScreen />,
} satisfies Story;

export const InteractionHardening = {
  parameters: {
    notes:
      'Manual stress lab for scrolling, clipping, geometry invalidation, lifecycle cancellation, and render budgets.',
  },
  render: () => <InteractionHardeningScreen />,
} satisfies Story;
