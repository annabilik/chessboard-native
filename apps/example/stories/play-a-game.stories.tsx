import type { Meta, StoryObj } from '@storybook/react-native';

import ControlledSelectionScreen from '../app/controlled-selection';
import ControlledMoveRequestsScreen from '../app/move-request';
import PromotionAndPremovesScreen from '../app/rules-owned-moves';
import ControlledTransitionsScreen from '../app/transitions';
import PlayVsRandomScreen from '../src/play-vs-random-screen';

const meta = {
  title: 'Play a Game',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const PlayVsRandom = {
  name: 'Play vs Random (chess.js)',
  parameters: {
    notes:
      'Using with chess.js: the rules engine validates every move inside onMoveRequest, tap-to-move legal destinations come from chess.moves({ square }) through the selection prop, and the computer replies by publishing the next revisioned position. The board itself stays rules-free.',
  },
  render: () => <PlayVsRandomScreen />,
} satisfies Story;

export const MovesAndValidation = {
  parameters: {
    notes:
      'Your engine or server decides; the board never moves pieces itself. Accept, reject (snapback), and decision/commit timeouts over onMoveRequest, revisioned position, committedIntentId, and actionsRef.cancelMove().',
  },
  render: () => <ControlledMoveRequestsScreen />,
} satisfies Story;

export const SelectionAndLegalMoveHints = {
  parameters: {
    notes:
      'Selected square, destination dots, and disabled squares are consumer-owned selection state; taps arrive as onSquareActivate intents that never mutate the board.',
  },
  render: () => <ControlledSelectionScreen />,
} satisfies Story;

export const PromotionAndPremoves = {
  parameters: {
    notes:
      'Promotion choice and premove queues live in application rules state; the board only renders each committed position.',
  },
  render: () => <PromotionAndPremovesScreen />,
} satisfies Story;

export const MoveAnimationAndSpecialMoves = {
  parameters: {
    notes:
      'Castling, en passant, captures, promotion, interruption, and rebasing through inferred and explicit controlled transitions with reduced-motion support.',
  },
  render: () => <ControlledTransitionsScreen />,
} satisfies Story;
