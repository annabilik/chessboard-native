import {
  DEFAULT_DRAG_ACTIVATION_DISTANCE,
  normalizeChessboardGestureOptions,
} from '../../src/internal/gesture-options';

describe('chessboard gesture options', () => {
  it('returns one immutable default configuration for omitted options', () => {
    const first = normalizeChessboardGestureOptions(undefined);
    const second = normalizeChessboardGestureOptions(undefined);

    expect(first).toBe(second);
    expect(first).toEqual({
      activationDistance: DEFAULT_DRAG_ACTIVATION_DISTANCE,
    });
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('accepts custom and zero activation distances without retaining the input', () => {
    const input: { activationDistance?: number } = {
      activationDistance: 12.5,
    };
    const custom = normalizeChessboardGestureOptions(input);
    const zero = normalizeChessboardGestureOptions({ activationDistance: 0 });

    input.activationDistance = 2;

    expect(custom).toEqual({ activationDistance: 12.5 });
    expect(custom).not.toBe(input);
    expect(Object.isFrozen(custom)).toBe(true);
    expect(zero).toEqual({ activationDistance: 0 });
    expect(Object.isFrozen(zero)).toBe(true);
  });

  it.each([null, [], 'gesture', 3])(
    'rejects a non-object gesture value: %p',
    (value) => {
      expect(() => normalizeChessboardGestureOptions(value as never)).toThrow(
        'Chessboard gesture must be an object.',
      );
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, '4'])(
    'rejects an invalid activation distance: %p',
    (activationDistance) => {
      const value: unknown = { activationDistance };
      expect(() => normalizeChessboardGestureOptions(value as never)).toThrow(
        'Chessboard gesture.activationDistance must be a finite non-negative number.',
      );
    },
  );
});
