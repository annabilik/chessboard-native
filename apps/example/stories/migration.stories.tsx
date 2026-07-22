import type { Meta, StoryObj } from '@storybook/react-native';

import ReactChessboardCompatibilityScreen from '../app/react-chessboard-compat';

const meta = {
  parameters: { layout: 'fullscreen' },
  title: 'Gallery/Migration',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ReactChessboardCompatibility = {
  parameters: {
    notes:
      'Familiar react-chessboard option names and native piece, square, drop, and arrow callback payloads over the controlled pipeline.',
  },
  render: () => <ReactChessboardCompatibilityScreen />,
} satisfies Story;
