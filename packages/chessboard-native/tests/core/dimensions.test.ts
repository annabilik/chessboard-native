import fc from 'fast-check';

import { generateBoardGeometry } from '../../src/index';
import {
  validateBoardDimensions,
  validateColumnCount,
  validateOrientation,
  validateRowCount,
} from '../../src/core/dimensions';

describe('board dimensions and logical geometry', () => {
  it('[PARITY-EXPORT-GENERATE-BOARD] generates a validated orientation-aware board grid', () => {
    const white = generateBoardGeometry({ columns: 3, rows: 2 }, 'white');
    const black = generateBoardGeometry({ columns: 3, rows: 2 }, 'black');

    expect(white).toEqual([
      [
        { isLight: true, square: 'a2' },
        { isLight: false, square: 'b2' },
        { isLight: true, square: 'c2' },
      ],
      [
        { isLight: false, square: 'a1' },
        { isLight: true, square: 'b1' },
        { isLight: false, square: 'c1' },
      ],
    ]);
    expect(black).toEqual([
      [
        { isLight: false, square: 'c1' },
        { isLight: true, square: 'b1' },
        { isLight: false, square: 'a1' },
      ],
      [
        { isLight: true, square: 'c2' },
        { isLight: false, square: 'b2' },
        { isLight: true, square: 'a2' },
      ],
    ]);
    expect(Object.isFrozen(white)).toBe(true);
    expect(white.every((row) => Object.isFrozen(row))).toBe(true);
    expect(white.flat().every((square) => Object.isFrozen(square))).toBe(true);
  });

  it('[PARITY-BEHAVIOR-B05] validates dimensions and rotates only visual coordinate order', () => {
    fc.assert(
      fc.property(
        fc.record({
          columns: fc.integer({ max: 26, min: 1 }),
          rows: fc.integer({ max: 99, min: 1 }),
        }),
        (dimensions) => {
          const white = generateBoardGeometry(dimensions, 'white');
          const black = generateBoardGeometry(dimensions, 'black');
          const expectedBlack = white
            .map((row) => [...row].reverse())
            .reverse();

          expect(white).toHaveLength(dimensions.rows);
          expect(white.every((row) => row.length === dimensions.columns)).toBe(
            true,
          );
          expect(black).toEqual(expectedBlack);
          expect(new Set(white.flat().map(({ square }) => square)).size).toBe(
            dimensions.rows * dimensions.columns,
          );
        },
      ),
      { numRuns: 100 },
    );

    expect(() =>
      generateBoardGeometry({ columns: 8, rows: 0 }, 'white'),
    ).toThrow(RangeError);
    expect(() =>
      generateBoardGeometry({ columns: 8, rows: 1.5 }, 'white'),
    ).toThrow(TypeError);
    expect(() =>
      generateBoardGeometry({ columns: 27, rows: 8 }, 'white'),
    ).toThrow(RangeError);
    expect(() =>
      generateBoardGeometry({ columns: 8, rows: 8 }, 'sideways' as never),
    ).toThrow(TypeError);
  });

  it('accepts every supported dimension boundary', () => {
    expect(validateBoardDimensions({ columns: 1, rows: 1 })).toEqual({
      columns: 1,
      rows: 1,
    });
    expect(validateBoardDimensions({ columns: 26, rows: 99 })).toEqual({
      columns: 26,
      rows: 99,
    });
    expect(validateRowCount(99)).toBe(99);
    expect(validateColumnCount(26)).toBe(26);
    expect(validateOrientation('white')).toBe('white');
    expect(validateOrientation('black')).toBe('black');

    expect(generateBoardGeometry({ columns: 1, rows: 1 }, 'white')).toEqual([
      [{ isLight: false, square: 'a1' }],
    ]);
    const maximumBlackBoard = generateBoardGeometry(
      { columns: 26, rows: 99 },
      'black',
    );
    expect(maximumBlackBoard).toHaveLength(99);
    expect(maximumBlackBoard[0]).toHaveLength(26);
    expect(maximumBlackBoard[0]?.[0]?.square).toBe('z1');
    expect(maximumBlackBoard.at(-1)?.at(-1)?.square).toBe('a99');
  });

  it.each([
    ['rows below the minimum', { columns: 8, rows: 0 }, RangeError],
    ['rows above the maximum', { columns: 8, rows: 100 }, RangeError],
    ['columns below the minimum', { columns: 0, rows: 8 }, RangeError],
    ['columns above the maximum', { columns: 27, rows: 8 }, RangeError],
    ['fractional rows', { columns: 8, rows: 1.5 }, TypeError],
    ['fractional columns', { columns: 1.5, rows: 8 }, TypeError],
    ['NaN rows', { columns: 8, rows: Number.NaN }, TypeError],
    [
      'infinite rows',
      { columns: 8, rows: Number.POSITIVE_INFINITY },
      TypeError,
    ],
    ['string rows', { columns: 8, rows: '8' }, TypeError],
    ['missing rows', { columns: 8 }, TypeError],
    ['missing columns', { rows: 8 }, TypeError],
  ] as const)('rejects %s', (_name, dimensions, errorType) => {
    expect(() => validateBoardDimensions(dimensions)).toThrow(errorType);
  });

  it('rejects malformed dimension containers and orientations', () => {
    expect(() => validateBoardDimensions(null)).toThrow(TypeError);
    expect(() => validateBoardDimensions([])).toThrow(TypeError);
    expect(() => validateBoardDimensions('8x8')).toThrow(TypeError);
    expect(() => validateOrientation('sideways')).toThrow(TypeError);
  });
});
