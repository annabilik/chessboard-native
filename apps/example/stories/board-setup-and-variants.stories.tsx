import type { Meta, StoryObj } from '@storybook/react-native';

import ProviderCoordinationScreen from '../app/provider-coordination';
import SparePiecesScreen from '../app/spare-pieces';

const meta = {
  title: 'Board Setup and Variants',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const PiecePaletteAndDrops = {
  parameters: {
    notes:
      'A rules-free variant-editor palette: reusable and disabled SparePiece sources drop onto one named rectangular board. A consumer rules engine could use the same primitive for a drop variant such as Crazyhouse.',
  },
  render: () => <SparePiecesScreen />,
} satisfies Story;

export const MultipleBoardsAndCrossBoardDrag = {
  name: 'Multiple boards and isolated state',
  parameters: {
    notes:
      'Two independently controlled boards share one explicit ChessboardProvider and drag overlay without sharing semantic state. This story does not implement cross-board transfer or simul rules.',
  },
  render: () => <ProviderCoordinationScreen />,
} satisfies Story;
