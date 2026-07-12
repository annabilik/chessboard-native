import type {
  BoardDimensions,
  BoardOrientation,
  BoardSquare,
  SquareId,
} from '../public-types';
import {
  validateBoardDimensions,
  validateColumnCount,
  validateColumnIndex,
  validateOrientation,
  validateRank,
  validateRowCount,
  validateRowIndex,
} from './dimensions';

const FIRST_FILE_CODE_POINT = 'a'.charCodeAt(0);
const CANONICAL_SQUARE_PATTERN = /^([a-z])([1-9][0-9]?)$/;

export interface BoardCoordinate {
  readonly row: number;
  readonly column: number;
}

function rowIndexToRankUnchecked(
  rowIndex: number,
  rows: number,
  orientation: BoardOrientation,
): number {
  return orientation === 'white' ? rows - rowIndex : rowIndex + 1;
}

function rankToRowIndexUnchecked(
  rank: number,
  rows: number,
  orientation: BoardOrientation,
): number {
  return orientation === 'white' ? rows - rank : rank - 1;
}

function columnIndexToFileIndexUnchecked(
  columnIndex: number,
  columns: number,
  orientation: BoardOrientation,
): number {
  return orientation === 'white' ? columnIndex : columns - columnIndex - 1;
}

function fileIndexToColumnIndexUnchecked(
  fileIndex: number,
  columns: number,
  orientation: BoardOrientation,
): number {
  return orientation === 'white' ? fileIndex : columns - fileIndex - 1;
}

function fileIndexToFile(fileIndex: number): string {
  return String.fromCodePoint(FIRST_FILE_CODE_POINT + fileIndex);
}

export function formatSquareIdUnchecked(
  fileIndex: number,
  rank: number,
): SquareId {
  return `${fileIndexToFile(fileIndex)}${String(rank)}`;
}

function parseFile(file: unknown, columns: number): number {
  if (typeof file !== 'string') {
    throw new TypeError('File must be a string.');
  }

  if (!/^[a-z]$/.test(file)) {
    throw new SyntaxError('File must be one lowercase ASCII letter.');
  }

  const fileIndex = file.charCodeAt(0) - FIRST_FILE_CODE_POINT;
  if (fileIndex >= columns) {
    throw new RangeError(
      `File must be between "a" and "${fileIndexToFile(columns - 1)}".`,
    );
  }

  return fileIndex;
}

export function parseSquareId(
  square: unknown,
  dimensions: Readonly<BoardDimensions>,
): Readonly<{ fileIndex: number; rank: number }> {
  if (typeof square !== 'string') {
    throw new TypeError('Square ID must be a string.');
  }

  const match = CANONICAL_SQUARE_PATTERN.exec(square);
  if (match === null) {
    throw new SyntaxError(
      'Square ID must contain one lowercase ASCII file and a rank from 1 to 99.',
    );
  }

  const file = square.charAt(0);
  const rankText = square.slice(1);
  const fileIndex = parseFile(file, dimensions.columns);
  const rank = Number(rankText);
  validateRank(rank, dimensions.rows);

  return Object.freeze({ fileIndex, rank });
}

function validateCoordinate(
  coordinate: unknown,
  dimensions: Readonly<BoardDimensions>,
): Readonly<BoardCoordinate> {
  if (
    typeof coordinate !== 'object' ||
    coordinate === null ||
    Array.isArray(coordinate)
  ) {
    throw new TypeError(
      'Board coordinate must be an object with row and column indices.',
    );
  }

  const candidate = coordinate as Record<string, unknown>;
  return Object.freeze({
    column: validateColumnIndex(candidate['column'], dimensions.columns),
    row: validateRowIndex(candidate['row'], dimensions.rows),
  });
}

/**
 * Convert a top-origin visual row index to its canonical rank.
 *
 * @public
 */
export function rowIndexToRank(
  rowIndex: number,
  rows: number,
  orientation: BoardOrientation,
): number {
  const validRows = validateRowCount(rows);
  const validOrientation = validateOrientation(orientation);
  const validRowIndex = validateRowIndex(rowIndex, validRows);

  return rowIndexToRankUnchecked(validRowIndex, validRows, validOrientation);
}

/**
 * Convert a canonical rank to its top-origin visual row index.
 *
 * @public
 */
export function rankToRowIndex(
  rank: number,
  rows: number,
  orientation: BoardOrientation,
): number {
  const validRows = validateRowCount(rows);
  const validOrientation = validateOrientation(orientation);
  const validRank = validateRank(rank, validRows);

  return rankToRowIndexUnchecked(validRank, validRows, validOrientation);
}

/**
 * Convert a left-origin visual column index to its canonical lowercase file.
 *
 * @public
 */
export function columnIndexToFile(
  columnIndex: number,
  columns: number,
  orientation: BoardOrientation,
): string {
  const validColumns = validateColumnCount(columns);
  const validOrientation = validateOrientation(orientation);
  const validColumnIndex = validateColumnIndex(columnIndex, validColumns);
  const fileIndex = columnIndexToFileIndexUnchecked(
    validColumnIndex,
    validColumns,
    validOrientation,
  );

  return fileIndexToFile(fileIndex);
}

/**
 * Convert a canonical lowercase file to its left-origin visual column index.
 *
 * @public
 */
export function fileToColumnIndex(
  file: string,
  columns: number,
  orientation: BoardOrientation,
): number {
  const validColumns = validateColumnCount(columns);
  const validOrientation = validateOrientation(orientation);
  const fileIndex = parseFile(file, validColumns);

  return fileIndexToColumnIndexUnchecked(
    fileIndex,
    validColumns,
    validOrientation,
  );
}

export function coordinateToSquare(
  coordinate: BoardCoordinate,
  dimensions: BoardDimensions,
  orientation: BoardOrientation,
): SquareId {
  const validDimensions = validateBoardDimensions(dimensions);
  const validOrientation = validateOrientation(orientation);

  const { column, row } = validateCoordinate(coordinate, validDimensions);
  const rank = rowIndexToRankUnchecked(
    row,
    validDimensions.rows,
    validOrientation,
  );
  const fileIndex = columnIndexToFileIndexUnchecked(
    column,
    validDimensions.columns,
    validOrientation,
  );

  return formatSquareIdUnchecked(fileIndex, rank);
}

export function squareToCoordinate(
  square: SquareId,
  dimensions: BoardDimensions,
  orientation: BoardOrientation,
): Readonly<BoardCoordinate> {
  const validDimensions = validateBoardDimensions(dimensions);
  const validOrientation = validateOrientation(orientation);
  const { fileIndex, rank } = parseSquareId(square, validDimensions);

  return Object.freeze({
    column: fileIndexToColumnIndexUnchecked(
      fileIndex,
      validDimensions.columns,
      validOrientation,
    ),
    row: rankToRowIndexUnchecked(rank, validDimensions.rows, validOrientation),
  });
}

/**
 * Build an immutable logical grid in visual row-major order.
 *
 * White orientation starts at `a{rows}`; black starts at `{lastFile}1`.
 * Square IDs and colors remain canonical across orientation changes.
 *
 * @public
 */
export function generateBoardGeometry(
  dimensions: BoardDimensions,
  orientation: BoardOrientation,
): readonly (readonly BoardSquare[])[] {
  const validDimensions = validateBoardDimensions(dimensions);
  const validOrientation = validateOrientation(orientation);
  const geometry: (readonly BoardSquare[])[] = [];

  for (let row = 0; row < validDimensions.rows; row += 1) {
    const rank = rowIndexToRankUnchecked(
      row,
      validDimensions.rows,
      validOrientation,
    );
    const visualRow: BoardSquare[] = [];

    for (let column = 0; column < validDimensions.columns; column += 1) {
      const fileIndex = columnIndexToFileIndexUnchecked(
        column,
        validDimensions.columns,
        validOrientation,
      );
      visualRow.push(
        Object.freeze({
          isLight: (fileIndex + rank) % 2 === 0,
          square: formatSquareIdUnchecked(fileIndex, rank),
        }),
      );
    }

    geometry.push(Object.freeze(visualRow));
  }

  return Object.freeze(geometry);
}
