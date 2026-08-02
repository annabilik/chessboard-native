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
      'Using with chess.js: the rules engine validates human requests inside onMoveRequest, tap-to-move legal destinations come from chess.moves({ square }) through the selection prop, and the computer chooses a legal reply before publishing the next revisioned position. The board itself stays rules-free.',
  },
  render: () => <PlayVsRandomScreen />,
} satisfies Story;

export const MovesAndValidation = {
  name: 'Move request lifecycle (rules-free)',
  parameters: {
    notes:
      'A rules-free protocol lab, not chess validation: arbitrary piece relocations exercise accept, reject (snapback), decision/commit timeouts, revisioned position, committedIntentId, and actionsRef.cancelMove(). A real app supplies its own engine or server.',
  },
  render: () => <ControlledMoveRequestsScreen />,
} satisfies Story;

export const SelectionAndLegalMoveHints = {
  parameters: {
    notes:
      'chess.js derives current legal destinations and validates every submitted move. Selected, destination, and disabled squares remain consumer-owned props; c3 demonstrates a separate product-policy block on an otherwise legal knight move.',
  },
  render: () => <ControlledSelectionScreen />,
} satisfies Story;

export const PromotionAndPremoves = {
  parameters: {
    notes:
      'Promotion choice and premove queues live in application rules state. The premove is queued while Black is to move, then chess.js revalidates it after Black’s legal e7-e5 update; the board only renders controlled revisions.',
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
