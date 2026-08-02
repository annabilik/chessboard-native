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
      'Familiar react-chessboard option and callback names over the controlled pipeline. This recipe uses chess.js to accept only legal drops and generates its programmatic arrows from current legal moves; the published board package remains rules-free.',
  },
  render: () => <ReactChessboardCompatibilityScreen />,
} satisfies Story;
