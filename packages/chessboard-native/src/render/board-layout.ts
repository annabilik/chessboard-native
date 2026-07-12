import { generateBoardGeometry } from '../core/coordinates';
import {
  validateBoardDimensions,
  validateOrientation,
  type ValidatedBoardDimensions,
} from '../core/dimensions';
import type {
  BoardDimensions,
  BoardOrientation,
  BoardSize,
  BoardSquare,
} from '../public-types';

/** Absolute board-local rectangle for one visual square. */
export interface BoardCellRect {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

/** One square and its measured visual placement. */
export interface BoardCellLayout extends BoardSquare {
  readonly column: number;
  readonly fileLabel: string | null;
  readonly rankLabel: string | null;
  readonly rect: Readonly<BoardCellRect>;
  readonly row: number;
}

/** Immutable layout projected into one measured board coordinate system. */
export interface BoardSurfaceLayout {
  readonly cellHeight: number;
  readonly cellWidth: number;
  readonly cells: readonly Readonly<BoardCellLayout>[];
  readonly dimensions: ValidatedBoardDimensions;
  readonly orientation: BoardOrientation;
  readonly size: Readonly<BoardSize>;
}

function validatePositiveFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero.`);
  }
  return value;
}

function validateMeasuredSize(size: unknown): Readonly<BoardSize> {
  if (typeof size !== 'object' || size === null || Array.isArray(size)) {
    throw new TypeError('Measured board size must contain width and height.');
  }

  const candidate = size as Record<string, unknown>;
  return Object.freeze({
    height: validatePositiveFiniteNumber(
      candidate['height'],
      'Measured board height',
    ),
    width: validatePositiveFiniteNumber(
      candidate['width'],
      'Measured board width',
    ),
  });
}

function getBoardCellRect(
  row: number,
  column: number,
  dimensions: ValidatedBoardDimensions,
  size: Readonly<BoardSize>,
): Readonly<BoardCellRect> {
  const left = (column / dimensions.columns) * size.width;
  const right = ((column + 1) / dimensions.columns) * size.width;
  const top = (row / dimensions.rows) * size.height;
  const bottom = ((row + 1) / dimensions.rows) * size.height;

  return Object.freeze({
    height: bottom - top,
    left,
    top,
    width: right - left,
  });
}

/**
 * Project canonical geometry into exact measured native bounds.
 *
 * Cumulative proportional edges intentionally remain fractional. Adjacent
 * cells therefore share the same edge and the final cells end exactly at the
 * measured width and height without rounding gaps.
 */
export function createBoardSurfaceLayout(
  size: BoardSize,
  dimensions: BoardDimensions,
  orientation: BoardOrientation,
): Readonly<BoardSurfaceLayout> {
  const validSize = validateMeasuredSize(size);
  const validDimensions = validateBoardDimensions(dimensions);
  const validOrientation = validateOrientation(orientation);
  const geometry = generateBoardGeometry(validDimensions, validOrientation);
  const cells: Readonly<BoardCellLayout>[] = [];

  for (let row = 0; row < validDimensions.rows; row += 1) {
    const geometryRow = geometry[row];
    if (geometryRow === undefined) {
      throw new RangeError('Generated board geometry omitted a visual row.');
    }

    for (let column = 0; column < validDimensions.columns; column += 1) {
      const square = geometryRow[column];
      if (square === undefined) {
        throw new RangeError(
          'Generated board geometry omitted a visual column.',
        );
      }

      cells.push(
        Object.freeze({
          column,
          fileLabel:
            row === validDimensions.rows - 1 ? square.square.charAt(0) : null,
          isLight: square.isLight,
          rankLabel: column === 0 ? square.square.slice(1) : null,
          rect: getBoardCellRect(row, column, validDimensions, validSize),
          row,
          square: square.square,
        }),
      );
    }
  }

  return Object.freeze({
    cellHeight: validSize.height / validDimensions.rows,
    cellWidth: validSize.width / validDimensions.columns,
    cells: Object.freeze(cells),
    dimensions: validDimensions,
    orientation: validOrientation,
    size: validSize,
  });
}
