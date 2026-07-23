import type { Meta, StoryObj } from '@storybook/react-native';

import ControlledAnnotationsScreen from '../app/controlled-annotations';
import GameReplayScreen from '../src/game-replay-screen';
import MateInTwoScreen from '../src/mate-in-two-screen';

const meta = {
  title: 'Analysis and Training',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ArrowsAndHighlights = {
  parameters: {
    notes:
      'Analysis arrows and square marks with drawing gestures: the consumer owns the annotation collection, and every gesture emits a revision-safe onAnnotationOperation delta reduced with applyAnnotationOperation.',
  },
  render: () => <ControlledAnnotationsScreen />,
} satisfies Story;

export const GameReplay = {
  parameters: {
    notes:
      'Step through the Opera Game (Morphy, Paris 1858) with animated moves: each step publishes the next controlled position with a monotonic revision, and the transition system infers moves, captures, and castling.',
  },
  render: () => <GameReplayScreen />,
} satisfies Story;

export const MateInTwoPuzzle = {
  parameters: {
    notes:
      "The Opera Game's forced finish (16.Qb8+!! Nxb8 17.Rd8#) as a puzzle: wrong moves are rejected and snap back, the scripted reply arrives as an ordinary controlled update.",
  },
  render: () => <MateInTwoScreen />,
} satisfies Story;
