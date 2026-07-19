import type { ReactElement } from 'react';

import { Chessboard as ControlledChessboard } from '../Chessboard';
import { createReactChessboardProps } from './adapter';
import type { ReactChessboardProps } from './types';

/**
 * Native compatibility wrapper for the pinned react-chessboard options shape.
 *
 * Position and arrows remain controlled; this component owns no semantic
 * collection and delegates rendering and interaction to the primary board.
 *
 * @public
 */
export function Chessboard({ options }: ReactChessboardProps): ReactElement {
  return <ControlledChessboard {...createReactChessboardProps(options)} />;
}
