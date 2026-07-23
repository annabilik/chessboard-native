import type { Meta, StoryObj } from '@storybook/react-native';

import PieceCallbacksScreen from '../app/piece-callbacks';
import SquarePressCallbacksScreen from '../app/square-press-callbacks';
import VisualCustomizationScreen from '../app/visual-customization';

const meta = {
  title: 'Look and Feel',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ThemesAndCustomPieces = {
  parameters: {
    notes:
      'Product branding: theme, per-instance styles, squareStyles, visual-only renderSquare content, and custom piece renderers.',
  },
  render: () => <VisualCustomizationScreen />,
} satisfies Story;

export const PieceTouchFeedback = {
  parameters: {
    notes:
      'Sounds, haptics, and analytics hooks: onPiecePress and onPieceDragStart observe piece interaction without mutating controlled state.',
  },
  render: () => <PieceCallbacksScreen />,
} satisfies Story;

export const SquarePressFeedback = {
  parameters: {
    notes:
      'Press-in/press-out feedback on occupied and empty squares through onSquarePressIn and onSquarePressOut, without claiming the gesture.',
  },
  render: () => <SquarePressCallbacksScreen />,
} satisfies Story;
