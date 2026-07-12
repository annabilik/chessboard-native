import type {
  BoardDimensions,
  BoardOrientation,
  BoardPoint,
  BoardSize,
  SquareId,
} from '../public-types';
import { coordinateToSquare, squareToCoordinate } from './coordinates';
import { validateBoardDimensions, validateOrientation } from './dimensions';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  return value;
}

function validateBoardSize(size: unknown): Readonly<BoardSize> {
  if (!isRecord(size)) {
    throw new TypeError('Board size must contain width and height.');
  }

  const width = validateFiniteNumber(size['width'], 'Board width');
  const height = validateFiniteNumber(size['height'], 'Board height');
  if (width <= 0 || height <= 0) {
    throw new RangeError('Board width and height must be greater than zero.');
  }

  return Object.freeze({ height, width });
}

function validateBoardPoint(point: unknown): Readonly<BoardPoint> {
  if (!isRecord(point)) {
    throw new TypeError('Board point must contain x and y coordinates.');
  }

  return Object.freeze({
    x: validateFiniteNumber(point['x'], 'Board point x'),
    y: validateFiniteNumber(point['y'], 'Board point y'),
  });
}

function axisIndexAtPoint(
  coordinate: number,
  extent: number,
  cellCount: number,
): number {
  let lower = 0;
  let upper = cellCount;

  while (lower < upper) {
    const candidate = Math.floor((lower + upper) / 2);
    const candidateEnd = ((candidate + 1) / cellCount) * extent;
    if (coordinate < candidateEnd) {
      upper = candidate;
    } else {
      lower = candidate + 1;
    }
  }

  return lower;
}

/**
 * Return the center of a canonical square in measured board-local coordinates.
 *
 * @public
 */
export function squareToBoardPoint(
  square: SquareId,
  size: BoardSize,
  dimensions: BoardDimensions,
  orientation: BoardOrientation,
): Readonly<BoardPoint> {
  const validDimensions = validateBoardDimensions(dimensions);
  const validOrientation = validateOrientation(orientation);
  const validSize = validateBoardSize(size);
  const coordinate = squareToCoordinate(
    square,
    validDimensions,
    validOrientation,
  );

  return Object.freeze({
    x: ((coordinate.column + 0.5) / validDimensions.columns) * validSize.width,
    y: ((coordinate.row + 0.5) / validDimensions.rows) * validSize.height,
  });
}

export function hitTestBoardPoint(
  point: BoardPoint,
  size: BoardSize,
  dimensions: BoardDimensions,
  orientation: BoardOrientation,
): SquareId | null {
  const validDimensions = validateBoardDimensions(dimensions);
  const validOrientation = validateOrientation(orientation);
  const validSize = validateBoardSize(size);
  const validPoint = validateBoardPoint(point);

  if (
    validPoint.x < 0 ||
    validPoint.y < 0 ||
    validPoint.x >= validSize.width ||
    validPoint.y >= validSize.height
  ) {
    return null;
  }

  const column = axisIndexAtPoint(
    validPoint.x,
    validSize.width,
    validDimensions.columns,
  );
  const row = axisIndexAtPoint(
    validPoint.y,
    validSize.height,
    validDimensions.rows,
  );

  return coordinateToSquare({ column, row }, validDimensions, validOrientation);
}
