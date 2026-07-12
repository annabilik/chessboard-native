import fc from 'fast-check';

import {
  squareToBoardPoint,
  type BoardDimensions,
  type BoardOrientation,
  type BoardSize,
} from '../../src/index';
import { coordinateToSquare } from '../../src/core/coordinates';
import { hitTestBoardPoint } from '../../src/core/hit-test';

const orientationArbitrary = fc.constantFrom<BoardOrientation>(
  'white',
  'black',
);

const measuredSquareCaseArbitrary = fc
  .record({
    columns: fc.integer({ max: 26, min: 1 }),
    rows: fc.integer({ max: 99, min: 1 }),
  })
  .chain((dimensions) =>
    fc.record({
      column: fc.integer({ max: dimensions.columns - 1, min: 0 }),
      dimensions: fc.constant(dimensions),
      orientation: orientationArbitrary,
      row: fc.integer({ max: dimensions.rows - 1, min: 0 }),
      size: fc.record({
        height: fc.integer({ max: 4_000, min: 1 }),
        width: fc.integer({ max: 4_000, min: 1 }),
      }),
    }),
  );

const measuredBoundaryCaseArbitrary = fc
  .record({
    columns: fc.integer({ max: 26, min: 2 }),
    rows: fc.integer({ max: 99, min: 2 }),
  })
  .chain((dimensions) =>
    fc.record({
      column: fc.integer({ max: dimensions.columns - 1, min: 1 }),
      dimensions: fc.constant(dimensions),
      orientation: orientationArbitrary,
      row: fc.integer({ max: dimensions.rows - 1, min: 1 }),
      size: fc.record({
        height: fc.integer({ max: 4_000, min: 1 }),
        width: fc.integer({ max: 4_000, min: 1 }),
      }),
    }),
  );

describe('measured board hit testing', () => {
  it('[PARITY-EXPORT-GET-RELATIVE-COORDS] maps square centers in measured rectangular board geometry', () => {
    const dimensions = { columns: 4, rows: 2 };
    const size = { height: 100, width: 400 };

    expect(squareToBoardPoint('a2', size, dimensions, 'white')).toEqual({
      x: 50,
      y: 25,
    });
    expect(squareToBoardPoint('d1', size, dimensions, 'white')).toEqual({
      x: 350,
      y: 75,
    });
    expect(squareToBoardPoint('a2', size, dimensions, 'black')).toEqual({
      x: 350,
      y: 75,
    });
    expect(
      Object.isFrozen(squareToBoardPoint('b2', size, dimensions, 'white')),
    ).toBe(true);
  });

  it('uses half-open outer bounds and assigns internal edges right and down', () => {
    const dimensions = { columns: 2, rows: 2 };
    const size = { height: 100, width: 200 };

    expect(hitTestBoardPoint({ x: 0, y: 0 }, size, dimensions, 'white')).toBe(
      'a2',
    );
    expect(hitTestBoardPoint({ x: 100, y: 0 }, size, dimensions, 'white')).toBe(
      'b2',
    );
    expect(hitTestBoardPoint({ x: 0, y: 50 }, size, dimensions, 'white')).toBe(
      'a1',
    );
    expect(
      hitTestBoardPoint({ x: 100, y: 50 }, size, dimensions, 'white'),
    ).toBe('b1');
    expect(
      hitTestBoardPoint({ x: 199.999, y: 99.999 }, size, dimensions, 'white'),
    ).toBe('b1');
    expect(
      hitTestBoardPoint({ x: 200, y: 50 }, size, dimensions, 'white'),
    ).toBeNull();
    expect(
      hitTestBoardPoint({ x: 50, y: 100 }, size, dimensions, 'white'),
    ).toBeNull();
    expect(
      hitTestBoardPoint({ x: -0.001, y: 0 }, size, dimensions, 'white'),
    ).toBeNull();
    expect(
      hitTestBoardPoint({ x: 0, y: -0.001 }, size, dimensions, 'white'),
    ).toBeNull();
  });

  it('projects the same board-local corners through both orientations', () => {
    const dimensions = { columns: 3, rows: 5 };
    const size = { height: 500, width: 300 };

    expect(hitTestBoardPoint({ x: 0, y: 0 }, size, dimensions, 'white')).toBe(
      'a5',
    );
    expect(hitTestBoardPoint({ x: 0, y: 0 }, size, dimensions, 'black')).toBe(
      'c1',
    );
    expect(
      hitTestBoardPoint({ x: 299.9, y: 499.9 }, size, dimensions, 'white'),
    ).toBe('c1');
    expect(
      hitTestBoardPoint({ x: 299.9, y: 499.9 }, size, dimensions, 'black'),
    ).toBe('a5');
  });

  it('round-trips arbitrary square centers for both orientations and rectangular cells', () => {
    fc.assert(
      fc.property(
        measuredSquareCaseArbitrary,
        ({ column, dimensions, orientation, row, size }) => {
          const square = coordinateToSquare(
            { column, row },
            dimensions,
            orientation,
          );
          const center = squareToBoardPoint(
            square,
            size,
            dimensions,
            orientation,
          );

          expect(hitTestBoardPoint(center, size, dimensions, orientation)).toBe(
            square,
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('maps every internal boundary to the following visual row or column', () => {
    const dimensions = { columns: 3, rows: 3 };
    const size = { height: 25, width: 25 };

    for (let column = 1; column < dimensions.columns; column += 1) {
      const x = (column / dimensions.columns) * size.width;
      expect(hitTestBoardPoint({ x, y: 0 }, size, dimensions, 'white')).toBe(
        coordinateToSquare({ column, row: 0 }, dimensions, 'white'),
      );
    }
    for (let row = 1; row < dimensions.rows; row += 1) {
      const y = (row / dimensions.rows) * size.height;
      expect(hitTestBoardPoint({ x: 0, y }, size, dimensions, 'white')).toBe(
        coordinateToSquare({ column: 0, row }, dimensions, 'white'),
      );
    }
  });

  it('assigns arbitrary measured boundaries after floating-point projection', () => {
    fc.assert(
      fc.property(
        measuredBoundaryCaseArbitrary,
        ({ column, dimensions, orientation, row, size }) => {
          const x = (column / dimensions.columns) * size.width;
          const y = (row / dimensions.rows) * size.height;

          expect(
            hitTestBoardPoint({ x, y: 0 }, size, dimensions, orientation),
          ).toBe(
            coordinateToSquare({ column, row: 0 }, dimensions, orientation),
          );
          expect(
            hitTestBoardPoint({ x: 0, y }, size, dimensions, orientation),
          ).toBe(
            coordinateToSquare({ column: 0, row }, dimensions, orientation),
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('covers the 1x1 and maximum z99 coordinate boundaries', () => {
    expect(
      hitTestBoardPoint(
        { x: 0, y: 0 },
        { height: 1, width: 1 },
        { columns: 1, rows: 1 },
        'white',
      ),
    ).toBe('a1');

    const dimensions = { columns: 26, rows: 99 };
    const size = { height: 9_900, width: 2_600 };
    for (let row = 0; row < dimensions.rows; row += 1) {
      for (let column = 0; column < dimensions.columns; column += 1) {
        const square = coordinateToSquare({ column, row }, dimensions, 'white');
        const center = squareToBoardPoint(square, size, dimensions, 'white');
        expect(hitTestBoardPoint(center, size, dimensions, 'white')).toBe(
          square,
        );
      }
    }
  });

  it.each([
    [null, TypeError],
    [[], TypeError],
    [{ height: 100 }, TypeError],
    [{ height: 100, width: '100' }, TypeError],
    [{ height: 100, width: Number.NaN }, TypeError],
    [{ height: Number.POSITIVE_INFINITY, width: 100 }, TypeError],
    [{ height: 100, width: 0 }, RangeError],
    [{ height: -1, width: 100 }, RangeError],
  ])('rejects malformed board size %p', (size, errorType) => {
    expect(() =>
      squareToBoardPoint('a1', size as never, { columns: 8, rows: 8 }, 'white'),
    ).toThrow(errorType);
  });

  it.each([
    null,
    [],
    { x: 1 },
    { x: '1', y: 1 },
    { x: Number.NaN, y: 1 },
    { x: 1, y: Number.NEGATIVE_INFINITY },
  ])('rejects malformed board point %p', (point) => {
    expect(() =>
      hitTestBoardPoint(
        point as never,
        { height: 100, width: 100 },
        { columns: 8, rows: 8 },
        'white',
      ),
    ).toThrow(TypeError);
  });

  it('rejects invalid dimensions, orientation, and square IDs', () => {
    const size = { height: 100, width: 100 } satisfies BoardSize;
    const dimensions = { columns: 8, rows: 8 } satisfies BoardDimensions;

    expect(() => squareToBoardPoint('A1', size, dimensions, 'white')).toThrow(
      SyntaxError,
    );
    expect(() => squareToBoardPoint('i1', size, dimensions, 'white')).toThrow(
      RangeError,
    );
    expect(() =>
      squareToBoardPoint('a1', size, { columns: 8, rows: 0 }, 'white'),
    ).toThrow(RangeError);
    expect(() =>
      squareToBoardPoint('a1', size, dimensions, 'sideways' as never),
    ).toThrow(TypeError);
  });
});
