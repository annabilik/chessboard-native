import type { BoardDimensions, BoardOrientation } from '../public-types';

export const MIN_BOARD_ROWS = 1;
export const MAX_BOARD_ROWS = 99;
export const MIN_BOARD_COLUMNS = 1;
export const MAX_BOARD_COLUMNS = 26;

export const STANDARD_BOARD_DIMENSIONS: Readonly<BoardDimensions> =
  Object.freeze({ columns: 8, rows: 8 });

function validateBoundedInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value)
  ) {
    throw new TypeError(`${name} must be a finite integer.`);
  }

  if (value < minimum || value > maximum) {
    throw new RangeError(
      `${name} must be between ${String(minimum)} and ${String(maximum)}, inclusive.`,
    );
  }

  return value;
}

export function validateRowCount(rows: unknown): number {
  return validateBoundedInteger(
    rows,
    'Board rows',
    MIN_BOARD_ROWS,
    MAX_BOARD_ROWS,
  );
}

export function validateColumnCount(columns: unknown): number {
  return validateBoundedInteger(
    columns,
    'Board columns',
    MIN_BOARD_COLUMNS,
    MAX_BOARD_COLUMNS,
  );
}

export function validateBoardDimensions(
  dimensions: unknown,
): Readonly<BoardDimensions> {
  if (
    typeof dimensions !== 'object' ||
    dimensions === null ||
    Array.isArray(dimensions)
  ) {
    throw new TypeError(
      'Board dimensions must be an object with rows and columns.',
    );
  }

  const candidate = dimensions as Record<string, unknown>;
  const rows = validateRowCount(candidate['rows']);
  const columns = validateColumnCount(candidate['columns']);

  return Object.freeze({ columns, rows });
}

export function validateOrientation(orientation: unknown): BoardOrientation {
  if (orientation !== 'white' && orientation !== 'black') {
    throw new TypeError('Board orientation must be "white" or "black".');
  }

  return orientation;
}

export function validateRowIndex(rowIndex: unknown, rows: number): number {
  return validateBoundedInteger(rowIndex, 'Row index', 0, rows - 1);
}

export function validateRank(rank: unknown, rows: number): number {
  return validateBoundedInteger(rank, 'Rank', 1, rows);
}

export function validateColumnIndex(
  columnIndex: unknown,
  columns: number,
): number {
  return validateBoundedInteger(columnIndex, 'Column index', 0, columns - 1);
}
