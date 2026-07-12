import {
  coordinateToSquare,
  parseSquareId,
  squareToCoordinate,
} from '../core/coordinates';
import type { ValidatedBoardDimensions } from '../core/dimensions';
import type { BoardOrientation, SquareId } from '../public-types';

export type AccessibilityCursorAction =
  | 'increment'
  | 'decrement'
  | 'move-cursor-left'
  | 'move-cursor-right'
  | 'move-cursor-up'
  | 'move-cursor-down';

function isSquareOnBoard(
  square: SquareId | null | undefined,
  dimensions: ValidatedBoardDimensions,
): square is SquareId {
  if (square === null || square === undefined) {
    return false;
  }

  try {
    parseSquareId(square, dimensions);
    return true;
  } catch {
    return false;
  }
}

/** First square in the orientation-aware visual reading order. */
export function createInitialAccessibilityCursor(
  dimensions: ValidatedBoardDimensions,
  orientation: BoardOrientation,
  preferredSquare?: SquareId | null,
): SquareId {
  return isSquareOnBoard(preferredSquare, dimensions)
    ? preferredSquare
    : coordinateToSquare({ column: 0, row: 0 }, dimensions, orientation);
}

/** Keep a canonical cursor square whenever the current dimensions still own it. */
export function reconcileAccessibilityCursor(
  square: SquareId | null,
  dimensions: ValidatedBoardDimensions,
  orientation: BoardOrientation,
  preferredSquare?: SquareId | null,
): SquareId {
  return isSquareOnBoard(square, dimensions)
    ? square
    : createInitialAccessibilityCursor(
        dimensions,
        orientation,
        preferredSquare,
      );
}

/** Zero-based position in orientation-aware visual row-major reading order. */
export function accessibilityCursorIndex(
  square: SquareId,
  dimensions: ValidatedBoardDimensions,
  orientation: BoardOrientation,
): number {
  const coordinate = squareToCoordinate(square, dimensions, orientation);
  return coordinate.row * dimensions.columns + coordinate.column;
}

/** Move without wrapping; an action at an edge returns the same canonical square. */
export function moveAccessibilityCursor(
  square: SquareId,
  action: AccessibilityCursorAction,
  dimensions: ValidatedBoardDimensions,
  orientation: BoardOrientation,
): SquareId {
  const coordinate = squareToCoordinate(square, dimensions, orientation);
  let column = coordinate.column;
  let row = coordinate.row;

  switch (action) {
    case 'increment': {
      const index = accessibilityCursorIndex(square, dimensions, orientation);
      const nextIndex = Math.min(
        index + 1,
        dimensions.rows * dimensions.columns - 1,
      );
      row = Math.floor(nextIndex / dimensions.columns);
      column = nextIndex % dimensions.columns;
      break;
    }
    case 'decrement': {
      const index = accessibilityCursorIndex(square, dimensions, orientation);
      const nextIndex = Math.max(index - 1, 0);
      row = Math.floor(nextIndex / dimensions.columns);
      column = nextIndex % dimensions.columns;
      break;
    }
    case 'move-cursor-left':
      column = Math.max(column - 1, 0);
      break;
    case 'move-cursor-right':
      column = Math.min(column + 1, dimensions.columns - 1);
      break;
    case 'move-cursor-up':
      row = Math.max(row - 1, 0);
      break;
    case 'move-cursor-down':
      row = Math.min(row + 1, dimensions.rows - 1);
      break;
  }

  return coordinateToSquare({ column, row }, dimensions, orientation);
}

export function canMoveAccessibilityCursor(
  square: SquareId,
  action: AccessibilityCursorAction,
  dimensions: ValidatedBoardDimensions,
  orientation: BoardOrientation,
): boolean {
  return (
    moveAccessibilityCursor(square, action, dimensions, orientation) !== square
  );
}
