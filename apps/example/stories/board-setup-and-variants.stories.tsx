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
      'A board-editor palette: reusable and disabled SparePiece sources drop onto a named rectangular board, the Crazyhouse-style building block.',
  },
  render: () => <SparePiecesScreen />,
} satisfies Story;

export const MultipleBoardsAndCrossBoardDrag = {
  parameters: {
    notes:
      'Simul and editor views: two independently controlled boards share one explicit ChessboardProvider and drag overlay without sharing any semantic state.',
  },
  render: () => <ProviderCoordinationScreen />,
} satisfies Story;
