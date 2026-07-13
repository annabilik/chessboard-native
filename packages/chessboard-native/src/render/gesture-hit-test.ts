import type { SquareId } from '../public-types';

function axisIndexAtGesturePoint(
  coordinate: number,
  extent: number,
  cellCount: number,
): number {
  'worklet';

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
 * Resolve one board-local gesture point through a flat visual cell map.
 *
 * The map is ordered from visual top-left to bottom-right. It therefore
 * already contains orientation and keeps this per-frame worklet independent
 * from canonical-coordinate parsing or React state.
 */
export function hitTestGesturePoint(
  x: number,
  y: number,
  width: number,
  height: number,
  columns: number,
  rows: number,
  visualSquares: readonly SquareId[],
): SquareId | null {
  'worklet';

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isSafeInteger(columns) ||
    !Number.isSafeInteger(rows) ||
    width <= 0 ||
    height <= 0 ||
    columns <= 0 ||
    rows <= 0 ||
    x < 0 ||
    y < 0 ||
    x >= width ||
    y >= height
  ) {
    return null;
  }

  const cellCount = columns * rows;
  if (!Number.isSafeInteger(cellCount) || visualSquares.length !== cellCount) {
    return null;
  }

  const column = axisIndexAtGesturePoint(x, width, columns);
  const row = axisIndexAtGesturePoint(y, height, rows);
  if (column < 0 || column >= columns || row < 0 || row >= rows) {
    return null;
  }

  const square = visualSquares[row * columns + column];
  return typeof square === 'string' && square.length > 0 ? square : null;
}
