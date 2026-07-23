import type { Meta, StoryObj } from '@storybook/react-native';

import ReactChessboardCompatibilityScreen from '../app/react-chessboard-compat';

const meta = {
  title: 'Migration',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const FromReactChessboard = {
  name: 'From react-chessboard',
  parameters: {
    notes:
      'Familiar react-chessboard option and callback names over the controlled pipeline. Upstream docs teach a chessGameRef workaround for stale onPieceDrop closures; revisioned positions with committedIntentId correlation make that bug class unrepresentable here.',
  },
  render: () => <ReactChessboardCompatibilityScreen />,
} satisfies Story;
