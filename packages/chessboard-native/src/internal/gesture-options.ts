import type { ChessboardGestureOptions } from '../public-types';

/** Current native threshold used by board and targeted spare gestures. */
export const DEFAULT_DRAG_ACTIVATION_DISTANCE = 4;

/** Fully resolved, immutable native gesture configuration. */
export interface NormalizedChessboardGestureOptions {
  readonly activationDistance: number;
}

const DEFAULT_GESTURE_OPTIONS: Readonly<NormalizedChessboardGestureOptions> =
  Object.freeze({
    activationDistance: DEFAULT_DRAG_ACTIVATION_DISTANCE,
  });

/** Validate the public partial gesture options once at the board boundary. */
export function normalizeChessboardGestureOptions(
  value: unknown,
): Readonly<NormalizedChessboardGestureOptions> {
  if (value === undefined) {
    return DEFAULT_GESTURE_OPTIONS;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Chessboard gesture must be an object.');
  }
  const options = value as Readonly<ChessboardGestureOptions>;
  const activationDistance =
    options.activationDistance ?? DEFAULT_DRAG_ACTIVATION_DISTANCE;
  if (
    typeof activationDistance !== 'number' ||
    !Number.isFinite(activationDistance) ||
    activationDistance < 0
  ) {
    throw new RangeError(
      'Chessboard gesture.activationDistance must be a finite non-negative number.',
    );
  }
  return Object.freeze({ activationDistance });
}
